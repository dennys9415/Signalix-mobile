# Claude Instructions — Signalix Mobile

This is `Signalix-mobile`, the React Native + Expo mobile app for Signalix.

## Absolute Rules

1. Use `@signalix/contracts` for every DTO, enum, response, request, and WS event. Never invent local types.
2. Reuse REST + WS endpoints from `Signalix-api` / `Signalix-realtime`. Do not invent mobile-specific endpoints.
3. **No browser APIs.** Do not import `indexedDB`, `localStorage`, `crypto.subtle`, `document`, or `window`. Use the native mobile equivalents:
   - tokens / secrets → `expo-secure-store`
   - non-sensitive state → `@react-native-async-storage/async-storage`
   - WebSocket: built-in (RN polyfills this natively)
4. **E2EE is wire-compatible with the web** (`src/crypto/`): X25519 + Ed25519 + HKDF-SHA256 + AES-256-GCM via pure-JS `@noble/*` (works in Expo Go; `react-native-get-random-values` is imported first in `index.js`). `signal.ts` has no RN imports — storage/API are injected so `test-scripts/pw/interop.mts` runs it in Node against the real web client. Keep it that way, and keep the envelope format identical to `Signalix-frontend/src/lib/crypto/signal.service.ts`. Keys live in AsyncStorage encrypted under a keychain master key (`storage.ts`). Text is encrypted to every recipient device; plaintext fallback when anyone has no keys.
5. Not yet on mobile: push notifications, incoming calls while the app is closed (needs VoIP push / paid Apple account), device management UI. Calls (`react-native-webrtc`), file picking (`expo-document-picker`) and voice notes (`expo-audio`) are native — they need the development build (`npx expo run:ios --device`), not Expo Go.
6. Design: soft teal → lavender gradients (`heroGradient`, `canvasGradient` in `lib/theme.ts`) on pure black, frosted translucent surfaces, big tightly-tracked display type. Keep new screens in this language.

## Technology

- Expo SDK 58 (managed workflow; runs in the current Expo Go)
- React Native 0.88
- TypeScript strict
- React Navigation 7 (native stack only, custom headers; deep links `signalix://chat/<id>`, `/profile`, `/new`)
- UI: `expo-linear-gradient`, `expo-image`, `@expo/vector-icons` (Feather), `expo-image-picker`
- Zustand v5
- `@signalix/contracts` via `file:` protocol

## Module layout

```
src/
  screens/       — Login, Register, Chats, Conversation, NewChat, Profile, ChatInfo
  navigation/    — RootNavigator (AuthStack | AppStack) + deep-link config
  components/    — reusable UI (Avatar, Section/Row, AuthLayout)
  store/         — auth.store, chat.store (zustand)
  services/      — api-client, ws-client, secure-store wrappers
  hooks/         — useSession, useChat, useMessages
  lib/           — config, theme, format helpers
  types/         — local-only types (no DTOs — those come from @signalix/contracts)
```

## What is NOT implemented in v0.16.0

- Push notifications
- Video attachments (photos, files and voice notes are sent/received encrypted; WebM voice notes recorded in Chrome can't play on iOS)
- Group management (create / edit / members) — groups are view-only
- Device verification / safety number UI
- Backup / restore (web-only in v0.15.0)
