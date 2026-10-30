import type { ReactNode } from "react";
import { getFixtureIdentity, useFoodedoAuth } from "./auth";
export function useAuth() {
  const auth = useFoodedoAuth();
  return { isLoaded: true, isSignedIn: auth.isSignedIn, userId: auth.userId };
}
export function useUser() {
  return {
    user: {
      fullName: "Alice",
      primaryEmailAddress: { emailAddress: "alice@example.com" },
    },
  };
}
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
  openSignIn() {},
  signOut() {},
};
export function useClerk() {
  return clerk;
}
export function Show({
  children,
  when,
}: {
  children: ReactNode;
  when: string;
}) {
  const guest = new URLSearchParams(location.search).get("role") === "guest";
  return (when === "signed-in") !== guest ? children : null;
}
export function SignInButton({ children }: { children: ReactNode }) {
  return children;
}

export function ClerkLoaded({ children }: { children: ReactNode }) {
  return children;
}
export function ClerkLoading() {
  return null;
}
export function ClerkFailed() {
  return null;
}
