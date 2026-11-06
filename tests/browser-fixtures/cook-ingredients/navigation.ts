const router = { push: (url: string) => window.history.pushState({}, "", url) };
export function useRouter() {
  return router;
}
export function useSearchParams() {
  return new URLSearchParams(window.location.search);
}
