import { counts, getState, update, useFixture } from "./state";
import type { ReactNode } from "react";

export function SignInButton({ children }: { children: ReactNode }) {
  return children;
}
export function useAuth() {
  const state = useFixture();
  return {
    isLoaded: state.isLoaded,
    isSignedIn: state.isSignedIn,
    userId: state.userId,
  };
}
export function useClerk() {
  return {
    async signOut() {
      counts.signOuts++;
      if (getState().signOutFails) throw new Error("offline");
      update({ isSignedIn: false, userId: null, isAuthenticated: false });
    },
  };
}
