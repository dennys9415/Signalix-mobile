// v0.17.0 — mobile port of the web Signal-style E2EE
// (Signalix-frontend/src/lib/crypto/signal.service.ts). Same wire format,
// so web and mobile devices can message each other encrypted:
//
//   per message: fresh ephemeral X25519 key
//     dh1 = X25519(eph, recipient signed pre-key)
//     dh2 = X25519(eph, recipient one-time pre-key)        (when the bundle has one)
//     key = HKDF-SHA256(dh1 || dh2, salt = 0^32, info = 'signalix-v1-direct-text')
//     ciphertext = JSON { v: 1, c: AES-256-GCM(key, iv, utf8), iv, eph }   (base64url)
//
// Storage and API are injected so this file has no React Native imports and
// the interop tests can drive it from Node against the real web client.

import type {
  DeviceKeyBundleDTO,
  KeyBundleResponse,
  RegisterDeviceKeysRequest,
  UploadPreKeysRequest,
} from '@signalix/contracts';
import {
  ED25519_BYTES,
  ED25519_SIG_BYTES,
  GCM_IV_BYTES,
  X25519_BYTES,
  aesGcmDecrypt,
  aesGcmEncrypt,
  base64UrlToBytes,
  bytesToBase64Url,
  concatBytes,
  ed25519KeyPair,
  ed25519Sign,
  ed25519Verify,
  hkdfAesKey,
  randomBytes,
  randomKeyId,
  randomRegistrationId,
  utf8Decode,
  utf8Encode,
  x25519KeyPair,
  x25519Shared,
} from './primitives';

const HKDF_INFO = 'signalix-v1-direct-text';
const INITIAL_PRE_KEY_COUNT = 100;
const PRE_KEY_TARGET_COUNT = 100;
const PRE_KEY_LOW_WATERMARK = 20;
/** Plaintext cache entries kept per device (own sends + decrypted history). */
const PLAINTEXT_CACHE_LIMIT = 3000;

const STATE_KEY = 'state';
const PLAINTEXT_KEY = 'plaintext';

/** Minimal async key-value store. On device: encrypted at rest (see storage.ts). */
export interface CryptoStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface CryptoApi {
  registerDeviceKeys(dto: RegisterDeviceKeysRequest): Promise<unknown>;
  uploadPreKeys(dto: UploadPreKeysRequest): Promise<unknown>;
  getKeyBundle(userId: string): Promise<KeyBundleResponse>;
}

/** One per recipient device — maps onto `GroupRecipientPayloadDTO`. */
export interface EncryptedEnvelope {
  ciphertext: string;
  encryptionVersion: 1;
  senderDeviceId: string;
  recipientDeviceId: string;
  preKeyId?: number;
  signedPreKeyId: number;
}

export interface IncomingEnvelope {
  ciphertext: string;
  encryptionVersion?: number | undefined;
  preKeyId?: number | undefined;
  signedPreKeyId?: number | undefined;
}

interface StoredPair { pub: string; priv: string }
interface StoredSpk extends StoredPair { keyId: number; sig: string }
interface StoredPreKey extends StoredPair { keyId: number; consumed: boolean }
interface CryptoState {
  deviceId: string;
  registrationId: number;
  identity: StoredPair;
  signing: StoredPair;
  spks: StoredSpk[];
  preKeys: StoredPreKey[];
  /** False until the server accepted our public keys — retried on next init. */
  published: boolean;
}

interface EnvelopeBlob { v: 1; c: string; iv: string; eph: string }

export class SignalCrypto {
  private state: CryptoState | null = null;
  private deviceId: string | null = null;
  private initPromise: Promise<void> | null = null;
  private ready = false;
  private plaintext: Record<string, string> | null = null;
  /** Serialises state writes (pre-key consumption can race between messages). */
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly storage: CryptoStorage, private readonly api: CryptoApi) {}

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Idempotent per device. A different deviceId (another account signed in)
   * re-runs init, which replaces the stored identity and publishes new keys —
   * the same fix the web client got for account switches.
   */
  init(opts: { deviceId: string }): Promise<void> {
    if (this.initPromise && this.deviceId === opts.deviceId) return this.initPromise;
    const previous = this.initPromise;
    this.ready = false;
    this.deviceId = opts.deviceId;
    const run: Promise<void> = (previous ? previous.catch(() => {}) : Promise.resolve())
      .then(() => this.doInit(opts.deviceId))
      .catch((err: unknown) => {
        // Let the next init() call retry (e.g. key publish failed while offline).
        if (this.initPromise === run) this.initPromise = null;
        throw err;
      });
    this.initPromise = run;
    return run;
  }

  /** Sign-out: forget in-memory keys. Stored keys stay until another device id replaces them. */
  reset(): void {
    this.state = null;
    this.deviceId = null;
    this.initPromise = null;
    this.ready = false;
    this.plaintext = null;
  }

  private async doInit(deviceId: string): Promise<void> {
    const raw = await this.storage.get(STATE_KEY);
    let state = raw ? (JSON.parse(raw) as CryptoState) : null;

    const usable = state
      && state.deviceId === deviceId
      && state.spks.length > 0
      && state.preKeys.length > 0;
    if (!usable) {
      // Missing, partial, or another device's keys: start over (plaintext cache too —
      // it belongs to that other identity).
      await this.storage.remove(PLAINTEXT_KEY);
      this.plaintext = {};
      state = generateState(deviceId);
      await this.persist(state);
    }
    this.state = state;

    if (!state!.published) {
      await this.api.registerDeviceKeys(publicBundle(state!));
      state!.published = true;
      await this.persist(state!);
    } else {
      await this.topUpPreKeys();
    }
    this.ready = true;
  }

  /**
   * Encrypt for every device the user has published keys for. Throws when
   * the user has none — callers fall back to plaintext, as the web does.
   */
  async encryptForUserAllDevices(plaintext: string, recipientUserId: string): Promise<EncryptedEnvelope[]> {
    await this.whenReady();
    const { bundles } = await this.api.getKeyBundle(recipientUserId);
    if (bundles.length === 0) throw new Error('Recipient has no published key bundle');
    return bundles.map((b) => this.encryptToBundle(plaintext, b));
  }

  private encryptToBundle(plaintext: string, bundle: DeviceKeyBundleDTO): EncryptedEnvelope {
    assertBundleIsValid(bundle);
    const eph = x25519KeyPair();
    const dh1 = x25519Shared(eph.secretKey, base64UrlToBytes(bundle.signedPreKey.publicKey));
    const ikm = bundle.preKey
      ? concatBytes(dh1, x25519Shared(eph.secretKey, base64UrlToBytes(bundle.preKey.publicKey)))
      : dh1;
    const key = hkdfAesKey(ikm, HKDF_INFO);
    const iv = randomBytes(GCM_IV_BYTES);
    const blob: EnvelopeBlob = {
      v: 1,
      c: bytesToBase64Url(aesGcmEncrypt(key, iv, utf8Encode(plaintext))),
      iv: bytesToBase64Url(iv),
      eph: bytesToBase64Url(eph.publicKey),
    };
    return {
      ciphertext: JSON.stringify(blob),
      encryptionVersion: 1,
      senderDeviceId: this.deviceId!,
      recipientDeviceId: bundle.deviceId,
      ...(bundle.preKey && { preKeyId: bundle.preKey.keyId }),
      signedPreKeyId: bundle.signedPreKey.keyId,
    };
  }

  /** Plaintext for an incoming message; passthrough for v0 (plaintext) messages. Throws on failure. */
  async decryptIncoming(env: IncomingEnvelope): Promise<string> {
    if (!env.encryptionVersion) return env.ciphertext;
    if (env.encryptionVersion !== 1) throw new Error(`Unsupported encryption version ${env.encryptionVersion}`);
    if (env.signedPreKeyId === undefined) throw new Error('Missing signedPreKeyId on envelope');
    await this.whenReady();
    const state = this.state!;

    let blob: EnvelopeBlob;
    try {
      blob = JSON.parse(env.ciphertext) as EnvelopeBlob;
    } catch {
      throw new Error('Malformed E2EE envelope');
    }
    if (blob.v !== 1) throw new Error(`Unsupported envelope version ${blob.v}`);

    const spk = state.spks.find((s) => s.keyId === env.signedPreKeyId);
    if (!spk) throw new Error(`Local signed pre-key ${env.signedPreKeyId} not found (sent to another device?)`);
    const preKey = env.preKeyId !== undefined ? state.preKeys.find((p) => p.keyId === env.preKeyId) : undefined;
    if (env.preKeyId !== undefined && !preKey) throw new Error(`Local one-time pre-key ${env.preKeyId} not found`);

    const ephPub = base64UrlToBytes(blob.eph);
    const dh1 = x25519Shared(base64UrlToBytes(spk.priv), ephPub);
    const ikm = preKey ? concatBytes(dh1, x25519Shared(base64UrlToBytes(preKey.priv), ephPub)) : dh1;
    const key = hkdfAesKey(ikm, HKDF_INFO);
    const plaintext = utf8Decode(aesGcmDecrypt(key, base64UrlToBytes(blob.iv), base64UrlToBytes(blob.c)));

    // Mark consumed only after a successful open; keep the row so late
    // duplicates referencing the same pre-key still decrypt.
    if (preKey && !preKey.consumed) {
      preKey.consumed = true;
      await this.persist(state);
      void this.topUpPreKeys().catch(() => {});
    }
    return plaintext;
  }

  /* ── Plaintext cache: own sends (nobody encrypts to the sender) + decrypted history ── */

  async cachePlaintext(messageId: string, text: string): Promise<void> {
    const cache = await this.loadPlaintext();
    cache[messageId] = text;
    const ids = Object.keys(cache);
    if (ids.length > PLAINTEXT_CACHE_LIMIT) {
      for (const id of ids.slice(0, ids.length - PLAINTEXT_CACHE_LIMIT)) delete cache[id];
    }
    await this.enqueueWrite(() => this.storage.set(PLAINTEXT_KEY, JSON.stringify(cache)));
  }

  async lookupPlaintext(messageId: string): Promise<string | undefined> {
    return (await this.loadPlaintext())[messageId];
  }

  private async loadPlaintext(): Promise<Record<string, string>> {
    if (!this.plaintext) {
      const raw = await this.storage.get(PLAINTEXT_KEY);
      this.plaintext = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    }
    return this.plaintext;
  }

  /* ── internals ── */

  private async whenReady(): Promise<void> {
    if (!this.initPromise) throw new Error('Crypto service not initialized');
    await this.initPromise;
    if (!this.state) throw new Error('Crypto service not initialized');
  }

  private async topUpPreKeys(): Promise<void> {
    const state = this.state;
    if (!state) return;
    const unconsumed = state.preKeys.filter((p) => !p.consumed).length;
    if (unconsumed >= PRE_KEY_LOW_WATERMARK) return;
    const fresh = Array.from({ length: PRE_KEY_TARGET_COUNT - unconsumed }, newPreKey);
    state.preKeys.push(...fresh);
    await this.persist(state);
    await this.api.uploadPreKeys({
      preKeys: fresh.map((p) => ({ keyId: p.keyId, publicKey: p.pub, algorithm: 'x25519' })),
      algorithm: 'x25519',
    });
  }

  private persist(state: CryptoState): Promise<void> {
    return this.enqueueWrite(() => this.storage.set(STATE_KEY, JSON.stringify(state)));
  }

  private enqueueWrite(write: () => Promise<void>): Promise<void> {
    const next = this.writeChain.then(write);
    this.writeChain = next.catch(() => {});
    return next;
  }
}

function newPreKey(): StoredPreKey {
  const kp = x25519KeyPair();
  return { keyId: randomKeyId(), pub: bytesToBase64Url(kp.publicKey), priv: bytesToBase64Url(kp.secretKey), consumed: false };
}

function generateState(deviceId: string): CryptoState {
  const identity = x25519KeyPair();
  const signing = ed25519KeyPair();
  const spk = x25519KeyPair();
  return {
    deviceId,
    registrationId: randomRegistrationId(),
    identity: { pub: bytesToBase64Url(identity.publicKey), priv: bytesToBase64Url(identity.secretKey) },
    signing: { pub: bytesToBase64Url(signing.publicKey), priv: bytesToBase64Url(signing.secretKey) },
    spks: [{
      keyId: randomKeyId(),
      pub: bytesToBase64Url(spk.publicKey),
      priv: bytesToBase64Url(spk.secretKey),
      sig: bytesToBase64Url(ed25519Sign(signing.secretKey, spk.publicKey)),
    }],
    preKeys: Array.from({ length: INITIAL_PRE_KEY_COUNT }, newPreKey),
    published: false,
  };
}

function publicBundle(state: CryptoState): RegisterDeviceKeysRequest {
  const spk = state.spks[state.spks.length - 1]!;
  return {
    registrationId: state.registrationId,
    identityKey: state.identity.pub,
    signingKey: state.signing.pub,
    signedPreKey: { keyId: spk.keyId, publicKey: spk.pub, signature: spk.sig, algorithm: 'x25519' },
    preKeys: state.preKeys.filter((p) => !p.consumed).map((p) => ({ keyId: p.keyId, publicKey: p.pub, algorithm: 'x25519' })),
    algorithm: 'x25519',
  };
}

/** Structural + signature checks before any ECDH (mirrors the web's assertBundleIsValid). */
function assertBundleIsValid(bundle: DeviceKeyBundleDTO): void {
  if (!bundle.identityKey || !bundle.signingKey || !bundle.signedPreKey) {
    throw new Error('Recipient bundle is missing required fields');
  }
  const signing = base64UrlToBytes(bundle.signingKey);
  const spk = base64UrlToBytes(bundle.signedPreKey.publicKey);
  const sig = base64UrlToBytes(bundle.signedPreKey.signature);
  if (base64UrlToBytes(bundle.identityKey).length !== X25519_BYTES) throw new Error('Recipient identityKey has wrong length');
  if (signing.length !== ED25519_BYTES) throw new Error('Recipient signingKey has wrong length');
  if (spk.length !== X25519_BYTES) throw new Error('Recipient signedPreKey has wrong length');
  if (sig.length !== ED25519_SIG_BYTES) throw new Error('Recipient signedPreKey signature has wrong length');
  if (bundle.preKey && base64UrlToBytes(bundle.preKey.publicKey).length !== X25519_BYTES) {
    throw new Error('Recipient preKey has wrong length');
  }
  if (!ed25519Verify(signing, sig, spk)) throw new Error('Recipient signed pre-key signature failed verification');
}

/** Decrypt an attachment blob with the key/iv carried in its (decrypted) message metadata. */
export function decryptMedia(ciphertext: Uint8Array, k: string, iv: string): Uint8Array {
  return aesGcmDecrypt(base64UrlToBytes(k), base64UrlToBytes(iv), ciphertext);
}
