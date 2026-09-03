import type { MetadataRoute } from "next";
import { foodedoColors } from "@/lib/design-system/tokens";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Foodedo",
    short_name: "Foodedo",
    description: "A decision-making engine for food.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: foodedoColors.paper,
    theme_color: foodedoColors.paper,
    categories: ["food", "lifestyle", "productivity"],
    lang: "en-GB",
    dir: "ltr",
    icons: [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
