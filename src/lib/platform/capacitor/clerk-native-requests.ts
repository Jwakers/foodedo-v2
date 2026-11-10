export interface ClerkClientTokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
}

type NativeRequest = {
  url?: URL;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
};

/** Follows Clerk's official native SDK hooks; Clerk owns token issuance/rotation. */
export function nativeClerkRequestHooks(
  frontendApiHost: string,
  store: ClerkClientTokenStore,
) {
  function assertClerkRequest(request: NativeRequest) {
    if (
      request.url?.protocol !== "https:" ||
      request.url.host !== frontendApiHost ||
      request.url.username ||
      request.url.password
    )
      throw new Error(
        "Native authentication refused an unexpected request host.",
      );
  }
  return {
    async before(request: NativeRequest) {
      assertClerkRequest(request);
      request.credentials = "omit";
      request.url!.searchParams.set("_is_native", "1");
      const headers = new Headers(request.headers);
      // Never reuse a browser-mode header or send a token to another host.
      headers.delete("Authorization");
      const token = await store.get();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      request.headers = headers;
    },
    async after(request: NativeRequest, response?: Response) {
      assertClerkRequest(request);
      const authorization = response?.headers.get("Authorization");
      if (!authorization) return;
      const token = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : authorization;
      if (token) await store.set(token);
    },
  };
}
