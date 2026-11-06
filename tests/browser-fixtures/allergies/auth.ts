import { useFixture } from "./state";
export function useFoodedoAuth() {
  const { signedIn } = useFixture();
  return {
    status: signedIn ? "authenticated" : "guest",
    isAuthenticated: signedIn,
    userId: signedIn ? "alice" : null,
  };
}
