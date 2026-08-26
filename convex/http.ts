import type { UserJSON, WebhookEvent } from "@clerk/backend";
import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

const iosOAuthCallbackUrl = "com.foodedo.app://callback";

// Clerk's browser-mode completion accepts HTTP(S), while the iOS auth session
// completes on the app scheme. Preserve every Clerk callback parameter.
http.route({
  path: "/clerk-oauth-callback",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const requestUrl = new URL(request.url);
    const appCallbackUrl = new URL(iosOAuthCallbackUrl);

    requestUrl.searchParams.forEach((value, key) => {
      appCallbackUrl.searchParams.append(key, value);
    });

    const callbackUrl = appCallbackUrl.toString();
    const callbackForScript = JSON.stringify(callbackUrl).replaceAll(
      "<",
      "\\u003c",
    );

    return new Response(
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Return to Foodedo</title>
  </head>
  <body>
    <main>
      <h1>Sign-in complete</h1>
      <p>Returning you to Foodedo…</p>
      <p><a id="return-to-app">Return to Foodedo</a></p>
    </main>
    <script>
      const callbackUrl = ${callbackForScript};
      document.getElementById("return-to-app").href = callbackUrl;
      window.location.replace(callbackUrl);
    </script>
  </body>
</html>`,
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          "Content-Type": "text/html; charset=utf-8",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }),
});

http.route({
  path: "/clerk-users-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const event = await verifyClerkWebhook(request);
    if (event === null) {
      return new Response("Invalid Clerk webhook", { status: 400 });
    }

    switch (event.type) {
      case "user.created":
      case "user.updated":
        await ctx.runMutation(
          internal.users.upsertFromClerk,
          userFields(event.data),
        );
        break;
      case "user.deleted":
        if (event.data.id) {
          await ctx.runMutation(internal.users.deleteFromClerk, {
            authSubject: event.data.id,
          });
        }
        break;
      default:
        break;
    }

    return new Response(null, { status: 200 });
  }),
});

function userFields(user: UserJSON) {
  const email =
    user.email_addresses.find(
      (candidate) => candidate.id === user.primary_email_address_id,
    )?.email_address ??
    user.email_addresses[0]?.email_address ??
    null;
  const name =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || null;

  return {
    authSubject: user.id,
    email,
    name,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

async function verifyClerkWebhook(
  request: Request,
): Promise<WebhookEvent | null> {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!secret || !svixId || !svixTimestamp || !svixSignature) {
    return null;
  }

  try {
    return new Webhook(secret).verify(await request.text(), {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return null;
  }
}

export default http;
