# Push notifications (Android · iOS · Web)

Device push ships as the **PUSH channel** of `@clevrook/messaging`, delivered via
**Firebase Cloud Messaging HTTP v1** — one Firebase project and one server
credential cover Android (native), iOS (Google's APNs relay), and browsers.
No Google SDK on the server: OAuth tokens are minted with a hand-rolled RS256
JWT grant (`node:crypto` + `fetch`), zero new dependencies.

## How it works

```
client app ──(FCM registration token)──▶ POST /api/v1/notifications/devices
feature code ──▶ MessagingService.dispatch({ messageType, userId, … })
                     └─ PUSH channel fans out to EVERY device the user registered
                          └─ FcmPushProvider → FCM v1 → Android / iOS / Web
                               └─ dead token (UNREGISTERED) ⇒ pruned automatically
```

- **Device registry** — `device_tokens` table (unique on token; a device that
  changes hands follows its current user; capped at 20 devices/user with
  stalest-eviction). Owned by `DeviceTokenService` in the messaging lib.
- **Fan-out** — `dispatch({ userId })` sends to all of the user's devices; an
  explicit `recipient: { pushToken }` targets a single device instead.
- **Hygiene** — FCM `UNREGISTERED`/invalid-token responses prune the
  registration; the compliance retention cron purges tokens unseen for
  `RETENTION_DEVICE_TOKEN_DAYS` (default 270, per FCM staleness guidance).
- **GDPR** — device tokens are registered as personal data: included in
  `/privacy/export`, deleted by `/privacy/erase`.
- **No mock data** — without FCM configured, PUSH routes to `console-push`
  (prints to stdout, explicit); with FCM configured there is **no console
  fallback**, so a failed real send surfaces as FAILED and dead tokens prune.

## Server setup

1. Create a Firebase project → Project settings → **Service accounts** →
   _Generate new private key_ (a JSON file).
2. Put it in the environment (raw or base64 — base64 avoids quoting pain):
   ```bash
   FCM_SERVICE_ACCOUNT_JSON=$(base64 < service-account.json | tr -d '\n')
   ```
3. That's it. The PUSH route defaults to `fcm` when the credential is present.
   Force a provider with `MESSAGING_PUSH_PROVIDER=fcm|console-push`, or store
   credentials encrypted in the DB (`messaging_provider_configs`, key `fcm`,
   credential field `serviceAccountJson`) — DB beats env.

## HTTP surface (JWT-guarded)

| Route                                  | Purpose                                              |
| -------------------------------------- | ---------------------------------------------------- |
| `POST /api/v1/notifications/devices`   | Register this device's FCM token (idempotent upsert) |
| `GET /api/v1/notifications/devices`    | List my devices (tokens masked)                      |
| `DELETE /api/v1/notifications/devices` | Unregister a token (call on logout)                  |

Client contract: register after login **and whenever FCM rotates the token**;
unregister on logout. Body: `{ "token": "<fcm token>", "platform": "ANDROID|IOS|WEB" }`.

## Getting a token on each platform (client side)

- **Android** — add `google-services.json` (Firebase console), the
  `firebase-messaging` SDK, then `FirebaseMessaging.getInstance().token` /
  `onNewToken` → POST to `/notifications/devices` with `platform: "ANDROID"`.
- **iOS** — upload your **APNs auth key** to Firebase (Project settings → Cloud
  Messaging), add the FirebaseMessaging pod, request notification permission,
  and use `Messaging.messaging().token` / delegate `didReceiveRegistrationToken`
  → POST with `platform: "IOS"`. (FCM relays to APNs — no APNs code server-side.)
- **Web** — Firebase JS SDK `getMessaging()` + `getToken({ vapidKey })` (Web
  Push certificate from the Firebase console) + a
  `firebase-messaging-sw.js` service worker → POST with `platform: "WEB"`.

The scaffold's own Expo app (`apps/mobile`, `src/push.ts`) implements the
register-after-login / unregister-on-logout contract — Android works in a dev
build with `google-services.json`; iOS needs `@react-native-firebase/messaging`
for a real FCM token. Details: [`docs/MOBILE.md`](MOBILE.md).

## Sending push from a feature

Nothing push-specific in feature code — the channel set lives on the message type:

```ts
// libs/messaging/src/enums/message-type.ts
[MessageType.TASK_ASSIGNED]: {
  channels: [Channel.EMAIL, Channel.IN_APP, Channel.PUSH], // add PUSH here
  ...
},
// libs/messaging/src/templates/registry.ts — PUSH variant:
[Channel.PUSH]: { subject: 'New task from {{assignerName}}', text: '{{taskTitle}}' },
```

`subject` becomes the notification title, `text` the body, and
`metadata.payload` (e.g. `{ taskId }`) rides along as FCM `data` for deep links.
`TASK_ASSIGNED` is the wired reference example.

## Testing

- Unit: the whole pipeline is covered (provider, registry, fan-out, prune).
- Local end-to-end without Firebase: leave `FCM_SERVICE_ACCOUNT_JSON` empty,
  register a device, trigger a `TASK_ASSIGNED` — the push prints via
  `console-push` with the token masked.
- Real-device test: set the service account, register a real FCM token from a
  test app, trigger the same flow.

See also: [`docs/agents/recipes.md`](agents/recipes.md) ("Send something"),
[`docs/COMPLIANCE.md`](COMPLIANCE.md) (device tokens in export/erasure/retention).
