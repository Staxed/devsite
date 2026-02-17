import type { Metadata, Viewport } from "next";
import SkipLink from "@/components/skip-link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Staxed.dev",
    template: "%s - Staxed.dev",
  },
  description:
    "Staxed - Developer, Crypto enthusiast, and AI Aficionado. Building tools, dragons, and digital worlds.",
  metadataBase: new URL("https://staxed.dev"),
  openGraph: {
    type: "website",
    url: "https://staxed.dev/",
    title: "Staxed.dev - Developer, Crypto, AI Aficionado",
    description:
      "Staxed - Developer, Crypto enthusiast, and AI Aficionado. Building tools, dragons, and digital worlds.",
    images: [
      {
        url: "/assets/StaxedDragonAvatar.jpg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Staxed.dev - Developer, Crypto, AI Aficionado",
    description:
      "Staxed - Developer, Crypto enthusiast, and AI Aficionado. Building tools, dragons, and digital worlds.",
    images: ["/assets/StaxedDragonAvatar.jpg"],
    creator: "@StaxedAF",
  },
  icons: {
    icon: "/assets/StaxedDragonAvatar.jpg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://github.com" />
        <link rel="preconnect" href="https://x.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Person",
              name: "Staxed",
              url: "https://staxed.dev",
              image: "https://staxed.dev/assets/StaxedDragonAvatar.jpg",
              sameAs: [
                "https://github.com/Staxed",
                "https://x.com/StaxedAF",
              ],
              jobTitle: "Developer",
              description:
                "Developer, Crypto enthusiast, and AI Aficionado. Building tools, dragons, and digital worlds.",
            }),
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col items-center justify-center p-8 px-4 text-text-main bg-transparent">
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
