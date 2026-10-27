/** Contact context only; this client-supplied value is never proof of ownership. */
export function resolveContactUserId(
  session: { isSignedIn?: boolean; userId?: string | null },
  forwardedUserId = "",
): string {
  return session.isSignedIn ? session.userId || "" : forwardedUserId;
}
