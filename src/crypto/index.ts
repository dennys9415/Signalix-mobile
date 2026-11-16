// App-wide E2EE service instance (device storage + REST key directory).
import { api } from '~/services/api-client';
import { SignalCrypto } from './signal';
import { deviceCryptoStorage } from './storage';

export const cryptoService = new SignalCrypto(deviceCryptoStorage, api);
export { decryptMedia } from './signal';
