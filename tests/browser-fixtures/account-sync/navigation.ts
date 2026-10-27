export function useRouter() {
  return {
    replace(path: string) {
      history.replaceState(null, "", path);
    },
  };
}
