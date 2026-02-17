import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Staxed.dev",
    short_name: "Staxed",
    description: "Staxed - Developer, Crypto enthusiast, and AI Aficionado",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/assets/StaxedDragonAvatar.jpg",
        sizes: "1024x1024",
        type: "image/jpeg",
        purpose: "any",
      },
      {
        src: "/assets/StaxedDragonAvatar512.jpg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "maskable",
      },
      {
        src: "/assets/StaxedDragonAvatar192.jpg",
        sizes: "192x192",
        type: "image/jpeg",
      },
    ],
  };
}
