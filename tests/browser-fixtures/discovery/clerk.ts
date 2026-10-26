export function useClerk() {
  return {
    openSignIn() {
      dispatchEvent(new Event("fixture:sign-in"));
    },
  };
}

export function useAuth() {
  return { isLoaded: true, isSignedIn: true };
}
