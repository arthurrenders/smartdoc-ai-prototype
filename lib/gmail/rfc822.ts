export function buildRfc822Message(params: {
  fromEmail: string
  toEmail: string
  subject: string
  body: string
}): string {
  const subject = rfc2047Subject(params.subject)
  const bodyB64 = wrapBase64(Buffer.from(params.body, "utf8").toString("base64"))
  return [
    `From: ${params.fromEmail}`,
    `To: ${params.toEmail}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    bodyB64,
  ].join("\r\n")
}

function rfc2047Subject(subject: string): string {
  if (!/[^\x20-\x7E]/.test(subject)) return subject
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`
}

function wrapBase64(b64: string): string {
  const lines: string[] = []
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76))
  return lines.join("\r\n")
}

export function toGmailRawUrlSafe(message: string): string {
  return Buffer.from(message, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "")
}
