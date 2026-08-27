# Convex and Clerk setup

The code integration contains no secrets. V2 uses its own Convex project and must use V2 Clerk configuration; never copy V1 deployment values or secret keys.

Clerk and Convex are required infrastructure. Next.js refuses to start or build without `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `NEXT_PUBLIC_CONVEX_URL`; Capacitor builds additionally require `NEXT_PUBLIC_CONVEX_SITE_URL`. Product components therefore assume their providers exist instead of maintaining an unconfigured runtime mode.

## Architecture

- Clerk's framework-neutral React SDK owns identity and the client sign-in session.
- `ConvexProviderWithClerk` supplies Clerk JWTs to the Convex client.
- Convex validates the JWT and derives the owner in every personal function.
- Clerk sends signed user lifecycle events directly to the Convex HTTP action at `/clerk-users-webhook`.
- Shared Next.js pages use client-side authentication so they remain compatible with the Capacitor static export. There is deliberately no Next.js Proxy or webhook Route Handler.
- The Capacitor shell runs Clerk's web SDK in its normal browser mode inside `WKWebView`. The WebView persists Clerk's browser session. An isolated Capacitor OAuth transport opens social providers with iOS's `ASWebAuthenticationSession`. Clerk completes against an HTTPS Convex callback, which immediately hands the result to the authentication session through `com.foodedo.app://callback`; setting `standardBrowser=false` without a native token adapter causes Clerk startup requests to fail.
- Do not replace `@clerk/react` with `@clerk/nextjs` in shared native routes: the Next-specific SDK introduces server-action behavior that the iOS static export rejects.

### Why the HTTPS OAuth callback remains

`/clerk-oauth-callback` is intentional, not residue from the earlier browser-plugin attempt. Foodedo keeps Clerk's browser-mode React session in the WebView, and that mode rejected `com.foodedo.app://callback` when supplied directly because it requires an HTTP(S) completion URL. The Convex route is the smallest bridge between those contracts: Clerk accepts its HTTPS URL, then the route forwards the untouched callback parameters to the app scheme captured by `ASWebAuthenticationSession`. It could be removed only if Foodedo moves to a supported native Clerk session/token integration or Clerk's browser-mode contract changes and is re-tested. Adding the app in Clerk's **Native applications** is still required for production configuration, but does not itself remove the bridge.

## 1. Clerk dashboard

1. Create or select a dedicated **Foodedo V2** application. Do not reuse V1 secrets.
2. For the first proof, enable email code or email/password authentication. Leave social providers until the iOS redirect test.
3. Open **Integrations → Convex** and activate the integration. Its token audience/application ID is `convex`.
4. Open **API keys** and copy:
   - **Publishable key** (`pk_test_...`) → `.env.local` as `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
   - **Frontend API URL** (`https://...clerk.accounts.dev`) → the Convex development deployment environment variable `CLERK_FRONTEND_API_URL`.
5. Add `capacitor://localhost` to the development instance's `allowed_origins`. Clerk requires this for browser-like Capacitor clients. Clerk currently exposes the setting through its Backend API. Use the development secret key only for this one-time dashboard configuration; do not add it to the Foodedo client or commit it. Prompt for the key so it is not saved in shell history, then inspect the current value before patching:

   ```bash
   read -s -p "Clerk development secret key: " CLERK_DEV_SECRET
   printf '\n'

   instance="$(curl --fail-with-body --silent --show-error https://api.clerk.com/v1/instance \
     --header "Authorization: Bearer $CLERK_DEV_SECRET")"

   payload="$(printf '%s' "$instance" | jq --arg origin 'capacitor://localhost' \
     '{allowed_origins: ((.allowed_origins // []) | if index($origin) then . else . + [$origin] end)}')"

   curl --fail-with-body --silent --show-error --request PATCH https://api.clerk.com/v1/instance \
     --header "Authorization: Bearer $CLERK_DEV_SECRET" \
     --header "Content-Type: application/json" \
     --data "$payload"

   unset CLERK_DEV_SECRET
   ```

   The PATCH sends the complete merged `allowed_origins` array; existing entries are kept and `capacitor://localhost` is added only when it is missing. The regular website domain is configured separately and does not normally belong in this list.

6. The running Foodedo clients do not call Clerk's server API, so `CLERK_SECRET_KEY` is intentionally not required in `.env.local`, Convex, Vercel, or the iOS bundle.

7. In **Native applications**, select **Add iOS app** and register the app with its exact Apple App ID Prefix and bundle ID `com.foodedo.app`. The prefix is shown on the app identifier in Apple's developer portal and can differ from the Team ID on older accounts. Registration establishes Clerk's iOS application identity and is required before production; it does not replace the callback allowlist below. Under **Allowlist for mobile SSO redirect**, add the development deployment's exact HTTPS bridge URL:

   ```text
   https://your-v2-deployment.convex.site/clerk-oauth-callback
   ```

   Use the value from `NEXT_PUBLIC_CONVEX_SITE_URL`, followed by `/clerk-oauth-callback`. This is distinct from `allowed_origins`: the origin permits the packaged WebView to call Clerk, while the mobile SSO entry permits Clerk to return security-sensitive OAuth state to the HTTPS bridge. The bridge then opens the registered app scheme. Clerk's standard-browser completion endpoint rejects a custom scheme when it is supplied directly.

Clerk's native iOS quickstart also requires an Xcode Associated Domains entry of `webcredentials:{CLERK_FRONTEND_API_HOST}`. Add it after selecting the Apple development team, using the host only (for example `webcredentials:example.clerk.accounts.dev`). The **Native API** toggle is not required by the current WebView proof. Enable it only when adding a real native Clerk client or token adapter; that pathway has a different persistence and CAPTCHA security model.

## 2. Convex dashboard

Open the **Foodedo V2 development deployment**, then **Settings → Environment Variables** and add:

| Variable                 | Value                                                      |
| ------------------------ | ---------------------------------------------------------- |
| `CLERK_FRONTEND_API_URL` | Clerk Frontend API URL, including `https://`               |
| `CLERK_WEBHOOK_SECRET`   | Add after creating the Clerk webhook; starts with `whsec_` |

The Convex CLI has already written the ignored V2 `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, and `NEXT_PUBLIC_CONVEX_SITE_URL` values to `.env.local`.

After adding the Frontend API URL, push the functions and regenerate bindings:

```bash
pnpm exec convex dev --once
```

## 3. Clerk user-sync webhook

1. In Clerk, open **Webhooks → Add endpoint**.
2. Use `${NEXT_PUBLIC_CONVEX_SITE_URL}/clerk-users-webhook` as the endpoint. It must use the `.convex.site` URL, not `.convex.cloud`.
3. Subscribe to `user.created`, `user.updated`, and `user.deleted`.
4. Create the endpoint and copy its signing secret (`whsec_...`).
5. Store that value as `CLERK_WEBHOOK_SECRET` in the Convex development deployment—not in Next.js or a committed file.
6. Run `pnpm exec convex dev --once` again, then send Clerk's example event or create a test user.

Webhook verification uses the raw request plus Svix signature headers. Valid create/update events upsert by `authSubject`; deletion removes the matching V2 user document.

## 4. Verify locally

```bash
pnpm dev
```

1. Open `http://localhost:3000` and select **Sign in**.
2. Complete the enabled email flow.
3. Confirm the page changes to **Sign out** and reports that Convex is authenticated.
4. Wait for the status to report that Clerk and Convex are connected.
5. In Convex **Data → users**, confirm exactly one row exists with the Clerk user ID in `authSubject`.
6. Update the user in Clerk and confirm the same row is patched rather than duplicated.
7. Sign out and confirm the UI returns to **Sign in**.

Clerk webhooks are eventually consistent, so a short “waiting for the Clerk webhook” state is expected.

## 5. Capacitor iOS proof

Build and sync with the public Clerk and Convex variables present at build time:

```bash
pnpm cap:sync:ios
pnpm cap:open:ios
```

Test email sign-in and sign-out on a real simulator/device first. Then test Google through the iOS authentication sheet and confirm it dismisses automatically after returning to Foodedo. iOS may show its standard consent prompt before opening the provider; there must be no JSON error, post-authentication “Open in Foodedo?” prompt, or manual browser close. Before enabling any additional social/SSO provider for iOS:

1. Confirm the iOS app in Clerk **Native applications** uses bundle ID `com.foodedo.app` and the correct Apple App ID Prefix/Team configuration.
2. Confirm `${NEXT_PUBLIC_CONVEX_SITE_URL}/clerk-oauth-callback` remains in Clerk's mobile SSO redirect allowlist.
3. Confirm the Convex functions include the public `GET /clerk-oauth-callback` HTTP action.
4. Test every enabled provider on-device. Embedded WebView and external-browser redirect behavior must not be assumed from the desktop browser result.

The OAuth adapter is isolated in `src/lib/platform/capacitor/clerk-oauth-transport.ts`. A narrow local Capacitor plugin in `ios/App/App/ClerkOAuthPlugin.swift` exposes Apple's purpose-built `ASWebAuthenticationSession`; this is used instead of a generic browser plugin so iOS captures the callback, dismisses the sheet, and returns the URL directly. `SceneDelegate` must instantiate `BridgeViewController`, which registers that plugin; replacing it with a plain `CAPBridgeViewController` makes social sign-in stop after Clerk's brief loading spinner. The transport gives Clerk the HTTPS Convex bridge URL; the bridge preserves the callback parameters and opens `com.foodedo.app://callback`, which completes the native authentication session. Re-verify the integration when upgrading `@clerk/react`; if Clerk removes or changes the internal option, replace this adapter rather than spreading compatibility code through product features. Do not emulate Clerk's native token protocol with request hooks or store native client tokens in WebView local storage.

The packaged app has origin `capacitor://localhost`, so that origin must appear in the Clerk instance's `allowed_origins`. The iOS app still registers the `com.foodedo.app` scheme and receives `com.foodedo.app://callback`, but Clerk itself redirects to the allowlisted HTTPS Convex bridge. Origin allowlisting and mobile redirect allowlisting are separate settings. Do not work around either with a production Capacitor `server.url`.

## 6. Production later

Use the Clerk production instance and Convex production deployment. Configure their Frontend API URL, publishable key, client URL, and a separate production webhook/signing secret. Never point a production Clerk webhook at the development Convex deployment.

The full release gate is in [the production pre-launch checklist](production-pre-launch-checklist.md).
