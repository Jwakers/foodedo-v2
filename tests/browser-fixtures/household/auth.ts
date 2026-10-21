export function useFoodedoAuth() {
  const guest = new URLSearchParams(location.search).get("role") === "guest";
  return {
    status: guest ? "guest" : "authenticated",
    isAuthenticated: !guest,
    isClerkLoaded: true,
    isSignedIn: !guest,
    userId: "fixture-alice",
  } as const;
}
