/** Additional checks for a deliverable build; development exports stay usable. */
export function assertIosReleaseEnvironment(
  environment: Record<string, string | undefined>,
) {
  if (
    !environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim().startsWith(
      "pk_live_",
    )
  ) {
    throw new Error(
      "iOS release requires a production Clerk publishable key (pk_live_).",
    );
  }
  for (const name of [
    "NEXT_PUBLIC_CONVEX_URL",
    "NEXT_PUBLIC_CONVEX_SITE_URL",
    "NEXT_PUBLIC_SITE_URL",
  ]) {
    const raw = environment[name]?.trim();
    let url: URL;
    try {
      url = new URL(raw ?? "");
    } catch {
      throw new Error(`iOS release requires ${name} to be an HTTPS origin.`);
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !url.hostname.includes(".") ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".localhost") ||
      url.hostname.endsWith(".local") ||
      /^[\d.]+$/.test(url.hostname) ||
      url.hostname.includes(":")
    ) {
      throw new Error(
        `iOS release requires ${name} to be a public HTTPS origin.`,
      );
    }
  }
}
