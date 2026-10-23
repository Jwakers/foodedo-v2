import { useSyncExternalStore } from "react";
function subscribe(notify: () => void) {
  window.addEventListener("fixture:auth-change", notify);
  return () => window.removeEventListener("fixture:auth-change", notify);
}
export function getFixtureIdentity() {
  return (
    sessionStorage.getItem("fixture:identity") ??
    (new URLSearchParams(location.search).get("role") === "guest"
      ? "guest"
      : "fixture-alice")
  );
}
export function useFoodedoAuth() {
  const identity = useSyncExternalStore(subscribe, getFixtureIdentity);
  const guest = identity === "guest";
  return {
    status: guest ? "guest" : "authenticated",
    isAuthenticated: !guest,
    isClerkLoaded: true,
    isSignedIn: !guest,
    userId: guest ? null : identity,
  } as const;
}
