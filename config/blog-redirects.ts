import type { Redirect } from "next/dist/lib/load-custom-routes";

/**
 * Define blog-specific 301 redirects for merged or removed posts.
 *
 * Example:
 *   { source: "/blog/old-slug", destination: "/blog/new-slug", permanent: true }
 *
 * Leave this list empty by default; add entries as needed when posts are merged.
 */
const blogRedirects: Redirect[] = [
  // { source: "/blog/old-post", destination: "/blog/new-post", permanent: true },
];

export default blogRedirects;

