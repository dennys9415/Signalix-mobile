# Signalix-mobile

**Version: v0.16.0**

React Native + Expo mobile client for Signalix. Foundation MVP — Android-first.

## What works in v0.16.0

- Auth (login / register / refresh-on-401 / logout) backed by `expo-secure-store`.
- Chat list with realtime updates, pull-to-refresh, unread badges, presence dots.
- Direct + group conversations: history, send, receive, auto-deliver, auto-read.
- Bottom tabs (Chats / Settings) + push to Conversation.
- Settings: username / email / display name / app version / sign out.

## What's deferred

| Feature | Lands in |
|---|---|
| E2EE port (X25519 + Ed25519 + AES-GCM + HKDF via `@stablelib/*`) | v0.17.0 |
| Push notifications (APNs / FCM) | v0.18.0 |
| Media / file / voice notes | v0.19.0 |
| Voice + video calls | v0.20.0 |
| Group management UI | v0.22.0+ |

See [`docs/MOBILE_ROADMAP.md`](../docs/MOBILE_ROADMAP.md).

## Stack

- Expo SDK 51 (managed workflow)
- React Native 0.74 / React 18.2 / TypeScript strict
- React Navigation (native-stack + bottom-tabs)
- Zustand v5
- `@signalix/contracts` via `file:` protocol

## Setup

See [`docs/MOBILE_SETUP.md`](../docs/MOBILE_SETUP.md) for the full walkthrough. Quick version:

```bash
# 1. Build the shared contracts package first
cd ../Signalix-contracts && npm install && npm run build && cd -

# 2. Install + start
npm install
npm run start

# 3. press `a` to launch Android emulator
```

Edit `app.json` → `extra.apiUrl` + `extra.wsUrl` for non-default backend hosts.

## Architecture

See [`docs/MOBILE_ARCHITECTURE.md`](../docs/MOBILE_ARCHITECTURE.md). Repository layout:

```
src/
  screens/        — Login, Register, Chats, Conversation, Settings
  navigation/     — RootNavigator (AuthStack | AppStack with Tabs)
  store/          — auth.store, chat.store (zustand)
  services/       — api-client, ws-client, secure-store
  lib/            — config, theme, format helpers
  hooks/          — reserved for v0.17.0+
  components/     — reserved
  types/          — local-only (DTOs live in @signalix/contracts)
```

## v0.16.0 changelog — Foundation MVP

### Added
- Initial repository scaffolding (Expo + TS + React Navigation + Zustand).
- `services/api-client.ts` — REST wrapper with 401-refresh-retry, typed via `@signalix/contracts`.
- `services/ws-client.ts` — WebSocket client with 30s heartbeat + 3s reconnect, mirrors the web v0.14.0 lifecycle.
- `services/secure-store.ts` — `expo-secure-store` for the session blob + `AsyncStorage` placeholder.
- `store/auth.store.ts` + `store/chat.store.ts` — zustand stores mirroring the web shape minus E2EE.
- 5 screens (`Login`, `Register`, `Chats`, `Conversation`, `Settings`).
- 3 docs files in `proyect/docs/`: `MOBILE_ARCHITECTURE.md`, `MOBILE_SETUP.md`, `MOBILE_ROADMAP.md`.

### Known limitations
- **Plaintext only** — E2EE not on mobile yet. Web↔web E2EE remains; web↔mobile + mobile↔mobile is plaintext until v0.17.0. Settings → About surfaces this explicitly.
- No push, media, calls, voice notes, device management, advanced settings.
- Android emulator + Expo Go are the supported dev surfaces; signed APK / iOS production are out of scope.

### Not changed
- `Signalix-api`, `Signalix-realtime`, `Signalix-contracts` are byte-identical to v0.15.0 apart from the lockstep version bump. The mobile app reuses every existing endpoint and WS event.
