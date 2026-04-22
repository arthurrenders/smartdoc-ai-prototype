import "server-only"
import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LEN = 12

function getKey(): Buffer {
  const hex = process.env.GMAIL_TOKEN_ENCRYPTION_KEY
  if (!hex) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY is not set in environment variables")
  const buf = Buffer.from(hex, "hex")
  if (buf.length !== 32)
    throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)")
  return buf
}

export function encryptTokenPlaintext(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  // format: hex(iv):hex(authTag):hex(ciphertext)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`
}

export function decryptTokenCiphertext(ciphertext: string): string {
  const key = getKey()
  const parts = ciphertext.split(":")
  if (parts.length !== 3) throw new Error("Invalid token ciphertext format")
  const [ivHex, tagHex, encHex] = parts
  const iv = Buffer.from(ivHex, "hex")
  const tag = Buffer.from(tagHex, "hex")
  const enc = Buffer.from(encHex, "hex")
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(enc).toString("utf8") + decipher.final("utf8")
}
