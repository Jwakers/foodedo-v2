type Context = { params: Promise<{ path: string[] }> };

/** Web-only proxy: never forward Clerk cookies, authorisation or referrer headers. */
async function forward(request: Request, { params }: Context) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim())
    return new Response(null, { status: 404 });
  const { path } = await params;
  const host = (
    process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com"
  ).replace(/\/$/, "");
  const assets = host.replace(".i.posthog.com", "-assets.i.posthog.com");
  const base = path[0] === "static" || path[0] === "array" ? assets : host;
  const url = new URL(base);
  // Assign pathname rather than resolving a user-supplied URL against the host.
  url.pathname = `/${path.map(encodeURIComponent).join("/")}${new URL(request.url).pathname.endsWith("/") ? "/" : ""}`;
  url.search = new URL(request.url).search;
  try {
    const upstream = await fetch(url, {
      method: request.method,
      headers: {
        "Content-Type":
          request.headers.get("content-type") || "application/json",
      },
      ...(request.method === "POST"
        ? { body: await request.arrayBuffer() }
        : {}),
      cache: "no-store",
      redirect: "error",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}

export { forward as GET, forward as POST };
