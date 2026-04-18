"use client"

const GSI_SCRIPT = "https://accounts.google.com/gsi/client"
const GAPI_SCRIPT = "https://apis.google.com/js/api.js"
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly"

type GapiWindow = Window & {
  gapi?: {
    load: (
      name: string,
      options: {
        callback: () => void
        onerror?: () => void
        timeout?: number
        ontimeout?: () => void
      }
    ) => void
  }
  google?: Record<string, unknown>
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve()
        return
      }
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true })
      return
    }
    const s = document.createElement("script")
    s.src = src
    s.async = true
    s.onload = () => {
      s.dataset.loaded = "1"
      resolve()
    }
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

function getGapi(): NonNullable<GapiWindow["gapi"]> {
  const g = (window as GapiWindow).gapi
  if (!g?.load) throw new Error("Google API (gapi) is not available")
  return g
}

function loadPickerApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    getGapi().load("picker", {
      callback: () => resolve(),
      onerror: () => reject(new Error("Failed to load Google Picker API")),
      timeout: 60000,
      ontimeout: () => reject(new Error("Timeout loading Google Picker API")),
    })
  })
}

type TokenClient = { requestAccessToken: (override?: { prompt?: string }) => void }

type GoogleIdentity = {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (tokenResponse: { error?: string; access_token?: string }) => void
      }) => TokenClient
    }
  }
}

type GooglePickerNs = {
  PickerBuilder: new () => PickerBuilderChain
  DocsView: new (viewId?: unknown) => { setMimeTypes: (m: string) => unknown }
  ViewId: { DOCS: unknown }
  Feature: { MULTISELECT_ENABLED: unknown }
  Action?: { PICKED: string; CANCEL: string; ERROR: string }
}

async function downloadDrivePdf(
  fileId: string,
  fileName: string,
  accessToken: string
): Promise<File> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`)
  url.searchParams.set("alt", "media")
  url.searchParams.set("supportsAllDrives", "true")
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Drive download failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const blob = await res.blob()
  const safeName = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`
  return new File([blob], safeName, { type: "application/pdf", lastModified: Date.now() })
}

type PickerDoc = { id?: string; name?: string; mimeType?: string }

/**
 * Drive Picker passes {@link https://developers.google.com/workspace/drive/picker/reference/picker.responseobject | ResponseObject}
 * with selected items in `docs` (not `documents`). Support both for compatibility.
 */
function readPickerCallbackData(data: Record<string, unknown>): {
  action: string
  documents: PickerDoc[]
} {
  const actionRaw = data.action
  const action = typeof actionRaw === "string" ? actionRaw : String(actionRaw ?? "")
  const raw = data.docs ?? data.documents
  if (!Array.isArray(raw)) {
    return { action, documents: [] }
  }
  const documents: PickerDoc[] = raw.map((d) => {
    if (!d || typeof d !== "object") return {}
    const o = d as Record<string, unknown>
    const id = typeof o.id === "string" ? o.id : undefined
    const name = typeof o.name === "string" ? o.name : undefined
    const mimeType = typeof o.mimeType === "string" ? o.mimeType : undefined
    return { id, name, mimeType }
  })
  return { action, documents }
}

type PickerBuilderChain = {
  addView: (v: unknown) => PickerBuilderChain
  enableFeature: (f: unknown) => PickerBuilderChain
  setOAuthToken: (t: string) => PickerBuilderChain
  setDeveloperKey: (k: string) => PickerBuilderChain
  setAppId: (id: string) => PickerBuilderChain
  setCallback: (cb: (d: Record<string, unknown>) => void) => PickerBuilderChain
  build: () => { setVisible: (v: boolean) => void }
}

/**
 * Load scripts + Picker API, then OAuth. The Picker is built and shown inside the token
 * callback immediately after a valid access_token is received (PDFs only via MIME filter).
 */
export async function pickGoogleDrivePdfFiles(): Promise<File[]> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY?.trim() ?? ""
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? ""
  const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID?.trim() ?? ""
  if (!apiKey || !clientId || !appId) {
    throw new Error(
      "Google Drive picker is not configured. Set NEXT_PUBLIC_GOOGLE_API_KEY, NEXT_PUBLIC_GOOGLE_CLIENT_ID, and NEXT_PUBLIC_GOOGLE_APP_ID (GCP project number) in .env.local."
    )
  }

  await loadScript(GSI_SCRIPT)
  await loadScript(GAPI_SCRIPT)
  await loadPickerApi()

  const win = window as GapiWindow
  const googleIdentity = win.google as GoogleIdentity | undefined
  const initTokenClient = googleIdentity?.accounts?.oauth2?.initTokenClient
  if (!initTokenClient) {
    throw new Error("Google Identity Services not available")
  }

  const pickerNs = win.google?.picker as GooglePickerNs | undefined
  if (!pickerNs?.PickerBuilder) {
    throw new Error("google.picker is not available")
  }

  const { PickerBuilder, DocsView, ViewId, Feature } = pickerNs
  const pdfView = new DocsView(ViewId.DOCS).setMimeTypes("application/pdf")

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }

    const tokenClient = initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (tokenResponse) => {
        if (tokenResponse.error) {
          finish(() => reject(new Error(tokenResponse.error)))
          return
        }
        const accessToken = tokenResponse.access_token
        if (!accessToken) {
          finish(() => reject(new Error("No access token returned")))
          return
        }

        const oauthAccessToken = accessToken

        const Action = pickerNs.Action
        const picked = Action?.PICKED ?? "picked"
        const cancel = Action?.CANCEL ?? "cancel"
        const errorAction = Action?.ERROR ?? "error"

        try {
          const picker = new PickerBuilder()
            .addView(pdfView)
            .enableFeature(Feature.MULTISELECT_ENABLED)
            .setOAuthToken(oauthAccessToken)
            .setDeveloperKey(apiKey)
            .setAppId(appId)
            .setCallback((data: Record<string, unknown>) => {
              const { action, documents } = readPickerCallbackData(data)
              if (action === cancel) {
                finish(() => resolve([]))
                return
              }
              if (action === errorAction) {
                finish(() =>
                  reject(
                    new Error(
                      typeof data.error === "string"
                        ? data.error
                        : "Google Picker reported an error."
                    )
                  )
                )
                return
              }
              if (action !== picked) {
                return
              }

              void (async () => {
                try {
                  const files: File[] = []
                  for (const doc of documents) {
                    const id = doc.id
                    const name = doc.name || "document.pdf"
                    const mime = doc.mimeType || ""
                    if (mime && mime !== "application/pdf") continue
                    if (!id) continue
                    const file = await downloadDrivePdf(id, name, oauthAccessToken)
                    files.push(file)
                  }
                  finish(() => resolve(files))
                } catch (e) {
                  finish(() => reject(e instanceof Error ? e : new Error(String(e))))
                }
              })()
            })
            .build()

          picker.setVisible(true)
        } catch (e) {
          finish(() => reject(e instanceof Error ? e : new Error(String(e))))
        }
      },
    })

    tokenClient.requestAccessToken()
  })
}
