import type { ReactNode } from "react";
import { counts, getState, subscribe, update, useFixture } from "./state";

export function useAuth() {
  const s = useFixture();
  return { isLoaded: s.isLoaded, isSignedIn: s.isSignedIn, userId: s.userId };
}
const clerk = {
  get user() {
    const s = getState();
    return s.isSignedIn && s.userId ? { id: s.userId } : null;
  },
  addListener(listener: (value: { user: { id: string } | null }) => void) {
    return subscribe(() => listener({ user: clerk.user }));
  },
  openSignIn() {
    counts.signIns++;
    update({ modalOpen: true });
  },
  async signOut() {
    counts.signOuts++;
    update({
      isSignedIn: false,
      userId: null,
      isAuthenticated: false,
      isLoading: false,
      account: undefined,
      saved: [],
    });
  },
};
export function useClerk() {
  return clerk;
}
export function Show({
  when,
  children,
}: {
  when: string;
  children: ReactNode;
}) {
  const s = useFixture();
  return (when === "signed-in") === s.isSignedIn ? children : null;
}
export function ClerkLoaded({ children }: { children: ReactNode }) {
  return useFixture().isLoaded ? children : null;
}
export function ClerkLoading({ children }: { children: ReactNode }) {
  return useFixture().isLoaded ? null : children;
}
export function ClerkFailed() {
  return null;
}
export function SignInButton({ children }: { children: ReactNode }) {
  return children;
}
const Nothing = () => null;
export const UserButton = Object.assign(() => <button>User menu</button>, {
  MenuItems: Nothing,
  Link: Nothing,
  Action: Nothing,
});
