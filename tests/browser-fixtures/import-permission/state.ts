export const calls: unknown[] = [];
export const navigation: string[] = [];
const beginImport = async (args: unknown) => {
  calls.push(args);
  return "fixture-import";
};
export function useMutation() {
  return beginImport;
}
export function useFoodedoAuth() {
  return { status: "authenticated", isAuthenticated: true };
}
const router = {
  push: (href: string) => {
    navigation.push(href);
  },
};
export function useRouter() {
  return router;
}
