import type { ReactNode } from "react";
export function useAuth() {
  return { isLoaded: true, isSignedIn: true, userId: "fixture-alice" };
}
export function useUser() {
  return {
    user: {
      fullName: "Alice",
      primaryEmailAddress: { emailAddress: "alice@example.com" },
    },
  };
}
export function useClerk() {
  return { openSignIn() {}, signOut() {} };
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
