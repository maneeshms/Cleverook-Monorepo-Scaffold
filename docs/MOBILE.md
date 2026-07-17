# Mobile app (`apps/mobile` — Expo React Native)

An Expo (React Native) **wiring reference** for Android/iOS clients of the
scaffold API: login/register against the auth endpoints, keychain-backed session
restore, the tasks demo, and push-device registration. Like the web frontends it
is **standalone** — its own `package.json` + lockfile, not part of the npm
workspaces — and has **no tests** (the 90% coverage floor is backend-only).

## Run it

```bash
npm run dev:mobile          # from the repo root (Metro dev server + QR code)
# or: cd apps/mobile && npm ci && npx expo start
```

Scan the QR with the **Expo Go** app (Android/iOS) or press `a`/`i` for an
emulator/simulator. First set the API URL the **device** can reach — a phone
cannot resolve your dev machine's `localhost`:

```bash
cd apps/mobile && cp .env.example .env
# EXPO_PUBLIC_API_URL=http://192.168.1.20:3000  (your LAN IP)
# Android emulator: http://10.0.2.2:3000
```

`EXPO_PUBLIC_*` vars are inlined at bundle time — restart `expo start` after
changing them, and never put secrets in them (they ship inside the app bundle).

## Token handling (the part to preserve)

| Token                    | Where                                                 | Why                                                   |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| Access (15 min JWT)      | module memory only                                    | short-lived; nothing sensitive persisted              |
| Refresh (30 d, rotating) | `expo-secure-store` (iOS Keychain / Android Keystore) | survives restarts; **never AsyncStorage** (plaintext) |

`src/api.ts` implements: session restore on launch (stored refresh token →
`POST /auth/refresh` → new pair), and a **single-flight** silent refresh+retry on
401 — concurrent requests share one refresh call because the API treats reuse of
a rotated refresh token as theft and revokes the whole session family.

## Push notifications

`src/push.ts` registers the device with `POST /notifications/devices` after
login and unregisters on logout (see `docs/PUSH_NOTIFICATIONS.md` for the
server side). Honest platform status:

- **Android** — works in a **dev build** with Firebase wired in: put
  `google-services.json` in `apps/mobile`, reference it via
  `expo.android.googleServicesFile` in `app.json`, then
  `npx expo run:android` (or an EAS build). `expo-notifications` then returns a
  real FCM registration token, which is exactly what the API's FCM v1 channel
  sends to. **Expo Go cannot receive remote push** (SDK 53+) — the sample logs
  and skips there.
- **iOS** — deliberately **skipped** in the sample: `expo-notifications` yields a
  raw APNs token on iOS, which FCM HTTP v1 cannot target, so registering it
  would only produce dead sends. To enable iOS push against this backend, add
  `@react-native-firebase/messaging` (config plugin + dev build) and register
  the FCM token it returns with platform `IOS`.
- Registration is **best-effort by design**: simulator, denied permission, or
  Expo Go log-and-skip — push never blocks login.

## Verify / CI

```bash
cd apps/mobile
npm run typecheck    # tsc --noEmit
npm run lint         # expo lint (eslint-config-expo)
npm run build        # expo export (Metro-bundles android + ios — no native SDKs needed)
```

The Nx targets (`nx build|lint mobile`) wrap these and run in the root
`npm run verify` / CI build job. `npm audit` covers `apps/mobile` via the
security workflow's directory matrix. There is **no Docker image** — the app
ships through EAS/app stores (`npx eas build`), so mobile is absent from the
docker/image-scan matrices on purpose.

## Dependencies

`expo-*` and `react-native` keep Expo's `~` ranges — the SDK owns those
versions. Add or bump Expo-managed packages with `npx expo install <pkg>`
(picks the SDK-compatible version), everything else stays exact-pinned.
Dependabot watches `apps/mobile` separately; majors land in the isolated
`major-updates` PR like the other apps.

## Generated projects

- `--mobile expo` (default) keeps the app; `--mobile none` prunes it everywhere
  (dir, `dev:mobile`, tsconfig exclude, dependabot block, audit matrix).
- `--minimal` reduces it to a health-check screen (auth/tasks/push wiring
  removed; the extra Expo packages stay installed so `npm ci` keeps working —
  `npm uninstall` them in `apps/mobile` if you won't add auth/push back).
