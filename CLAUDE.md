# Claude Instructions — Signalix Mobile

This is `Signalix-mobile`, the React Native + Expo mobile app for Signalix.

## Absolute Rules

1. Use `@signalix/contracts` for every DTO, enum, response, request, and WS event. Never invent local types.
2. Reuse REST + WS endpoints from `Signalix-api` / `Signalix-realtime`. Do not invent mobile-specific endpoints.
3. **No browser APIs.** Do not import `indexedDB`, `localStorage`, `crypto.subtle`, `document`, or `window`. Use the native mobile equivalents:
   - tokens / secrets → `expo-secure-store`
   - non-sensitive state → `@react-native-async-storage/async-storage`
   - WebSocket: built-in (RN polyfills this natively)
4. v0.16.0 is **plaintext-only**. No E2EE on mobile yet — the crypto stack ports in v0.17.0 (see `MOBILE_ROADMAP.md`). Mobile sends/receives plaintext; web↔web E2EE between web clients is unaffected.
5. Out of scope for v0.16.0: push notifications, voice/video calls, media uploads, voice notes, device management UI.

## Technology

- Expo SDK 51 (managed workflow)
- React Native 0.74
- TypeScript strict
- React Navigation (bottom tabs + native stack)
- Zustand v5
- `@signalix/contracts` via `file:` protocol

## Module layout

```
src/
  screens/       — top-level routes (Login, Register, Chats, Conversation, Settings)
  navigation/    — RootNavigator + AuthStack + AppTabs
  components/    — reusable UI (Avatar, ChatRow, MessageBubble)
  store/         — auth.store, chat.store (zustand)
  services/      — api-client, ws-client, secure-store wrappers
  hooks/         — useSession, useChat, useMessages
  lib/           — config, theme, format helpers
  types/         — local-only types (no DTOs — those come from @signalix/contracts)
```

## What is NOT implemented in v0.16.0

- E2EE (port lands in v0.17.0)
- Push notifications
- Media / file / voice attachments
- Voice + video calls
- Settings beyond username / email / logout / version
- Device verification / safety number UI
- Backup / restore (web-only in v0.15.0)
