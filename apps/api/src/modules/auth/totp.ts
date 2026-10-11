import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = "";
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, "0");
  }
  let encoded = "";
  for (let index = 0; index < bits.length; index += 5) {
    encoded += ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return encoded;
}

export function totpAuthUri(email: string, secret: string): string {
  return `otpauth://totp/Solar%20Accounting:${encodeURIComponent(email)}?secret=${secret}&issuer=Solar%20Accounting&algorithm=SHA1&digits=6&period=30`;
}

export function verifyTotp(secret: string, code: string, at = Date.now()): boolean {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }
  for (const delta of [-30_000, 0, 30_000]) {
    const expected = totpCode(secret, at + delta);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) {
      return true;
    }
  }
  return false;
}

export function currentTotpCode(secret: string, at = Date.now()): string {
  return totpCode(secret, at);
}

function totpCode(secret: string, at: number): string {
  const counter = Math.floor(at / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
}

function base32Decode(secret: string): Buffer {
  let bits = "";
  for (const char of secret.toUpperCase().replace(/=+$/, "")) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) {
      throw new Error("Invalid authenticator secret");
    }
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}
