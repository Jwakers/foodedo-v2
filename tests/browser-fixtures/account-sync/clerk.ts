import { counts, getState, update, useFixture } from "./state";
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
