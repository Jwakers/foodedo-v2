import { useSyncExternalStore } from "react";
const subscribe = (fn: () => void) => {
  window.addEventListener("popstate", fn);
  return () => window.removeEventListener("popstate", fn);
};
const snapshot = () => location.href;
export function usePathname() {
  useSyncExternalStore(subscribe, snapshot);
  return location.pathname;
}
export function useSearchParams() {
  useSyncExternalStore(subscribe, snapshot);
  return new URLSearchParams(location.search);
}
const navigate = (path: string) => {
  history.pushState({}, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
};
const router = {
  push: navigate,
  replace: navigate,
  back: () => history.back(),
};
export function useRouter() {
  return router;
}
