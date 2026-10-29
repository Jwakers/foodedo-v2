import { getFixtureIdentity, useFoodedoAuth } from "../household/auth";

const clerk = {
  get user() {
    const identity = getFixtureIdentity();
    return identity === "guest" ? null : { id: identity };
  },
  addListener(notify: (value: { user: { id: string } | null }) => void) {
    const listener = () => notify({ user: clerk.user });
    window.addEventListener("fixture:auth-change", listener);
    return () => window.removeEventListener("fixture:auth-change", listener);
  },
  openSignIn() {
    dispatchEvent(new Event("fixture:sign-in"));
  },
};

export function useClerk() {
  return clerk;
}

export function useAuth() {
  const auth = useFoodedoAuth();
  return { isLoaded: true, isSignedIn: auth.isSignedIn, userId: auth.userId };
}
