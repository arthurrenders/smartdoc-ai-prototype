"use client"

const apiKey = "PASTE_API_KEY_HERE"
const clientId = "PASTE_FULL_CLIENT_ID_HERE"
const appId = "PASTE_APP_ID_HERE"

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

function requestAccessToken(): Promise<string> {
  const win = window as GapiWindow
  const google = win.google as
    | {
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
    | undefined

  const init = google?.accounts?.oauth2?.initTokenClient
  if (!init) throw new Error("Google Identity Services not available")

  return new Promise((resolve, reject) => {
    const tokenClient = init({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (tokenResponse) => {
        if (tokenResponse.error) {
          reject(new Error(tokenResponse.error))
          return
        }
        if (!tokenResponse.access_token) {
          reject(new Error("No access token returned"))
          return
        }
        resolve(tokenResponse.access_token)
      },
    })
    tokenClient.requestAccessToken()
  })
}

async function downloadDrivePdf(
  fileId: string,
  fileName: string,
  accessToken: string
): Promise<File> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Drive download failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const blob = await res.blob()
  const safeName = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`
  return new File([blob], safeName, { type: "application/pdf" })
}

type PickerDoc = { id?: string; name?: string; mimeType?: string }

function readPickerCallbackData(data: Record<string, unknown>): {
  action: string
  documents: PickerDoc[]
} {
  const action = typeof data.action === "string" ? data.action : ""
  const raw = data.documents
  const documents: PickerDoc[] = Array.isArray(raw)
    ? raw.map((d) => (d && typeof d === "object" ? (d as PickerDoc) : {}))
    : []
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
 * OAuth → Drive Picker (PDFs only) → download as File[]. Empty if user cancels picker.
 */
export async function pickGoogleDrivePdfFiles(): Promise<File[]> {
  await loadScript(GSI_SCRIPT)
  await loadScript(GAPI_SCRIPT)
  await loadPickerApi()

  const accessToken = await requestAccessToken()

  const win = window as GapiWindow
  const pickerNs = win.google?.picker as
    | {
        PickerBuilder: new () => PickerBuilderChain
        DocsView: new (viewId?: unknown) => { setMimeTypes: (m: string) => unknown }
        ViewId: { DOCS: unknown }
        Feature: { MULTISELECT_ENABLED: unknown }
      }
    | undefined

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

    const picker = new PickerBuilder()
      .addView(pdfView)
      .enableFeature(Feature.MULTISELECT_ENABLED)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setCallback((data: Record<string, unknown>) => {
        const { action, documents } = readPickerCallbackData(data)
        if (action === "cancel") {
          finish(() => resolve([]))
          return
        }
        if (action !== "picked") {
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
              const file = await downloadDrivePdf(id, name, accessToken)
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
  })
}
