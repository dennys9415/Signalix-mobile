// Pure-JS crypto primitives (@noble/*) — byte-for-byte compatible with the
// web client's Web Crypto calls (Signalix-frontend/src/lib/crypto/utils.ts):
//   X25519 ECDH, Ed25519 signatures, HKDF-SHA256 (zero salt) → AES-256-GCM
//   (ciphertext || 16-byte tag), base64url without padding.
// No React Native imports, so the same code runs under Node for the
// web ↔ mobile interop tests. Callers must make `crypto.getRandomValues`
// available first (react-native-get-random-values on device).

import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';

export interface RawKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export const X25519_BYTES = 32;
export const ED25519_BYTES = 32;
export const ED25519_SIG_BYTES = 64;
export const GCM_IV_BYTES = 12;

export function x25519KeyPair(): RawKeyPair {
  return x25519.keygen();
}

export function ed25519KeyPair(): RawKeyPair {
  return ed25519.keygen();
}

export function x25519Shared(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(secretKey, publicKey);
}

export function ed25519Sign(secretKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, secretKey);
}

/** `false` on any malformed input, like the web's verifyEd25519Signature. */
export function ed25519Verify(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

/** HKDF-SHA256 with a 32-byte zero salt → 256-bit AES key (matches web `hkdfAesKey`). */
export function hkdfAesKey(ikm: Uint8Array, info: string): Uint8Array {
  return hkdf(sha256, ikm, new Uint8Array(32), utf8Encode(info), 32);
}

export function aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return gcm(key, iv).encrypt(plaintext);
}

/** Throws on auth-tag mismatch. */
export function aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return gcm(key, iv).decrypt(ciphertext);
}

export { randomBytes };

/** Random 31-bit positive int — fits PostgreSQL INTEGER (pre-key ids). */
export function randomKeyId(): number {
  const b = randomBytes(4);
  return ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) & 0x7fffffff;
}

/** Random 16-bit int — Signal-style registration id. */
export function randomRegistrationId(): number {
  const b = randomBytes(2);
  return (b[0]! << 8) | b[1]!;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i += 1) t[B64.charCodeAt(i)] = i;
  t['-'.charCodeAt(0)] = 62;
  t['_'.charCodeAt(0)] = 63;
  return t;
})();

/** Standard base64 with padding (data URIs). Table-driven: fast on large media. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += `${B64[(n >> 18) & 63]!}${B64[(n >> 12) & 63]!}==`;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += `${B64[(n >> 18) & 63]!}${B64[(n >> 12) & 63]!}${B64[(n >> 6) & 63]!}=`;
  }
  return out;
}

/** RFC 4648 base64url, no padding — the wire format for every key and envelope field. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Accepts base64url or standard base64, with or without padding. */
export function base64UrlToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const code = clean.charCodeAt(i);
    const v = code < 128 ? B64_LOOKUP[code]! : -1;
    if (v < 0) throw new Error('Invalid base64 input');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

// Hand-rolled UTF-8: Hermes doesn't reliably ship TextDecoder.
export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function utf8Decode(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length;) {
    const c = b[i]!;
    let cp: number;
    if (c < 0x80) { cp = c; i += 1; }
    else if (c < 0xe0) { cp = ((c & 31) << 6) | (b[i + 1]! & 63); i += 2; }
    else if (c < 0xf0) { cp = ((c & 15) << 12) | ((b[i + 1]! & 63) << 6) | (b[i + 2]! & 63); i += 3; }
    else { cp = ((c & 7) << 18) | ((b[i + 1]! & 63) << 12) | ((b[i + 2]! & 63) << 6) | (b[i + 3]! & 63); i += 4; }
    out += String.fromCodePoint(cp);
  }
  return out;
}
