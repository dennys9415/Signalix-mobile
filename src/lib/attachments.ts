// Encrypted attachments — same scheme as the web (v0.11.0, file-crypto.ts):
// fresh AES-256-GCM key + IV per file, upload only the ciphertext to
// /media/encrypted-blob, then send { v: 1, url, k, iv, mime, size, … } as the
// message body, which chat.store encrypts per recipient device like text.

import { File, Paths } from 'expo-file-system';
import { aesGcmEncrypt, bytesToBase64Url, randomBytes } from '~/crypto/primitives';
import { api } from '~/services/api-client';
import { decryptMedia } from '~/crypto';
import { mediaUrl } from '~/lib/config';

export interface MediaMetadataV1 {
  v: 1;
  url: string;
  k: string;
  iv: string;
  mime: string;
  size: number;
  filename?: string;
  /** Voice notes, in seconds. */
  duration?: number;
}

/** Same cap as the web composer. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export async function encryptAndUpload(
  localUri: string,
  meta: { mime: string; filename?: string; duration?: number },
): Promise<MediaMetadataV1> {
  const plain = await new File(localUri).bytes();
  if (plain.length > MAX_ATTACHMENT_BYTES) throw new Error('File is too large (max 25 MB).');

  const key = randomBytes(32);
  const iv = randomBytes(12);
  const ciphertext = aesGcmEncrypt(key, iv, plain);

  // RN FormData uploads from a file URI, so stage the ciphertext in the cache.
  const staged = new File(Paths.cache, `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  staged.write(ciphertext);
  try {
    const { url } = await api.uploadEncryptedBlob(staged.uri);
    return {
      v: 1,
      url,
      k: bytesToBase64Url(key),
      iv: bytesToBase64Url(iv),
      mime: meta.mime,
      size: plain.length,
      ...(meta.filename !== undefined && { filename: meta.filename }),
      ...(meta.duration !== undefined && { duration: meta.duration }),
    };
  } finally {
    try { staged.delete(); } catch { /* cache cleanup is best-effort */ }
  }
}

/** url → local decrypted file, so reopening / replaying doesn't re-download. */
const decryptedFiles = new Map<string, string>();

/** Download an attachment, decrypt it on device and return a local file URI. */
export async function decryptToCache(meta: MediaMetadataV1, fallbackName: string): Promise<string> {
  const hit = decryptedFiles.get(meta.url);
  if (hit) return hit;
  const res = await fetch(mediaUrl(meta.url) ?? meta.url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const plain = decryptMedia(bytes, meta.k, meta.iv);
  const safeName = (meta.filename ?? fallbackName).replace(/[^\w.\- ]+/g, '_');
  const out = new File(Paths.cache, `${Date.now().toString(36)}-${safeName}`);
  out.write(plain);
  decryptedFiles.set(meta.url, out.uri);
  return out.uri;
}

export function parseMediaMetadata(body: string): MediaMetadataV1 | null {
  try {
    const m = JSON.parse(body) as MediaMetadataV1;
    return m && m.v === 1 && typeof m.url === 'string' && m.k && m.iv ? m : null;
  } catch {
    return null;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
