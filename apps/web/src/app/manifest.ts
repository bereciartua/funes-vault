import type { MetadataRoute } from "next";

import { brand } from "../lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Funes Vault",
    short_name: "Funes",
    description:
      "A user-controlled memory layer for AI tools that keeps context inspectable and selectively shared.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: brand.darkBackground,
    theme_color: brand.primary,
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
