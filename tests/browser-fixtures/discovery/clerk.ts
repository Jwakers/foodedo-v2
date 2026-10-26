export function useClerk() {
  return {
    openSignIn() {
      dispatchEvent(new Event("fixture:sign-in"));
    },
  };
}
