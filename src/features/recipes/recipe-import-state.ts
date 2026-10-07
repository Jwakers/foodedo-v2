import type { FoodedoAuthStatus } from "@/features/auth/use-foodedo-auth";

/** A skipped private query is not a loading job. Resolve account access first. */
export function importJobAccess(status: FoodedoAuthStatus) {
  switch (status) {
    case "loading":
      return "loading";
    case "guest":
      return "sign_in";
    case "connection_error":
      return "reconnect";
    case "authenticated":
      return "ready";
  }
}

export function importJobResumePath(jobId: string) {
  return `/recipes/import?job=${encodeURIComponent(jobId)}`;
}

export function hasImportJobLink(pathname: string, search: string) {
  return (
    pathname === "/recipes/import" &&
    Boolean(new URLSearchParams(search).get("job"))
  );
}
