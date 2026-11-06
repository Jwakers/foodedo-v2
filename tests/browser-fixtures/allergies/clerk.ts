import { counts } from "./state";
export function useClerk() {
  return {
    openSignIn() {
      counts.signIns++;
    },
  };
}
