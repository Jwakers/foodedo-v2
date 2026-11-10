const diagnosticCodes = new Set([
  "oauth_access_denied",
  "oauth_invalid_state",
  "oauth_callback_failed",
  "authorization_invalid",
]);

/** Never return callback URLs, nonces, provider messages or arbitrary query data. */
export function oauthCallbackFailureCode(callbackUrl: string): string | null {
  try {
    const params = new URL(callbackUrl).searchParams;
    if (params.get("__clerk_status") !== "failed") return null;
    const codes = params.getAll("__clerk_error_code");
    const code = codes.length === 1 ? codes[0] : null;
    return code && diagnosticCodes.has(code) ? code : "unspecified";
  } catch {
    return null;
  }
}
