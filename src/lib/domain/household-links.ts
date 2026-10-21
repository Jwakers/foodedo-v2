/** Accept only the canonical HTTPS invitation route. OAuth stays with Clerk. */
export function householdInvitePath(
  url: string,
  siteUrl: string,
): string | null {
  try {
    const target = new URL(url);
    const site = new URL(siteUrl);
    if (
      target.protocol !== "https:" ||
      target.origin !== site.origin ||
      target.username ||
      target.password ||
      target.pathname !== "/household/join"
    )
      return null;
    const tokens = target.searchParams.getAll("token");
    if (tokens.length !== 1 || !/^[a-f0-9]{64}$/.test(tokens[0]!)) return null;
    return `/household/join?token=${tokens[0]}`;
  } catch {
    return null;
  }
}
