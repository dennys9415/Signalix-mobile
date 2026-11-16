// Displayable URI for an IMAGE message body. Two wire shapes:
//   • legacy plaintext: the body is the public media URL;
//   • E2EE (v0.11.0+): the body is the decrypted metadata JSON
//     { v: 1, url, k, iv, mime } — the blob at `url` is AES-256-GCM
//     ciphertext; download it, open it with k/iv, render as a data URI.

import { useEffect, useState } from 'react';
import { decryptMedia } from '~/crypto';
import { bytesToBase64 } from '~/crypto/primitives';
import { mediaUrl } from '~/lib/config';

interface MediaMetadataV1 { v: 1; url: string; k?: string; iv?: string; mime?: string }

/** body → resolved URI, so scrolling back doesn't re-download + re-decrypt. */
const resolved = new Map<string, string>();

export function useMediaUri(body: string | undefined): { uri: string | undefined; failed: boolean } {
  const [state, setState] = useState<{ uri: string | undefined; failed: boolean }>(() => ({
    uri: body ? resolved.get(body) ?? plainUrl(body) : undefined,
    failed: false,
  }));

  useEffect(() => {
    if (!body || resolved.has(body) || plainUrl(body)) return;
    let cancelled = false;
    (async () => {
      const meta = JSON.parse(body) as MediaMetadataV1;
      if (meta.v !== 1 || !meta.url) throw new Error('Unknown media metadata');
      const res = await fetch(mediaUrl(meta.url) ?? meta.url);
      if (!res.ok) throw new Error(`Media download failed: ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const plain = meta.k && meta.iv ? decryptMedia(bytes, meta.k, meta.iv) : bytes;
      const uri = `data:${meta.mime ?? 'image/jpeg'};base64,${bytesToBase64(plain)}`;
      resolved.set(body, uri);
      if (!cancelled) setState({ uri, failed: false });
    })().catch(() => {
      if (!cancelled) setState({ uri: undefined, failed: true });
    });
    return () => { cancelled = true; };
  }, [body]);

  return state;
}

function plainUrl(body: string): string | undefined {
  return body.startsWith('http') ? mediaUrl(body) : undefined;
}
