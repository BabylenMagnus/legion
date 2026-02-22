import { randomBytes } from "crypto"

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const LENGTH = 10

export const Slug = {
  create(): string {
    let result = ""
    const bytes = randomBytes(LENGTH)
    for (let i = 0; i < LENGTH; i++) {
      result += CHARS[bytes[i] % 62]
    }
    return result
  },
}
