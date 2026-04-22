/**
 * Browser-side helpers for password UX (strong generation).
 *
 * Uses `crypto.getRandomValues` — no network, no third-party libs.
 */

const DEFAULT_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*-_'

/**
 * Generate a random strong password.
 *
 * Default length = 16. Excludes ambiguous characters (0/O, 1/l/I).
 */
export function generateStrongPassword(length = 16): string {
  const alphabet = DEFAULT_ALPHABET
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  let pwd = ''
  for (let i = 0; i < length; i++) {
    pwd += alphabet[bytes[i]! % alphabet.length]
  }
  return pwd
}
