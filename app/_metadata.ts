import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "A pair programming tool for developers",
  twitter: { card: "summary_large_image" },
  openGraph: {
    url: "https://pairsync.vercel.app/",
    images: [
      {
        width: 1200,
        height: 630,
        url: "https://raw.githubusercontent.com/kleva-j/pairsync/main/.github/assets/project-logo.png",
      },
    ],
  },
};
