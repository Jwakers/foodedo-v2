export function usePathname() {
  return location.pathname;
}

export function useSearchParams() {
  return new URLSearchParams(location.search);
}

export function useRouter() {
  return {
    replace(path: string) {
      history.replaceState(null, "", path);
    },
  };
}
