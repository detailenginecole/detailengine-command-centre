import type { Metadata } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import "./globals.css";
import "./brand-v1.css";



const barlow = localFont({ src: [
  { path: "../public/fonts/Barlow-Regular.ttf", weight: "400", style: "normal" },
  { path: "../public/fonts/Barlow-Medium.ttf", weight: "500", style: "normal" },
  { path: "../public/fonts/Barlow-SemiBold.ttf", weight: "600", style: "normal" },
  { path: "../public/fonts/Barlow-Bold.ttf", weight: "700", style: "normal" },
], variable: "--font-barlow", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") || incoming.get("host") || "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const salesStartHost = host.split(":")[0].toLowerCase() === "start.getdetailengine.com";
  const title = salesStartHost
    ? "Start a client | DetailEngine"
    : "DetailEngine Command Centre";
  const description = salesStartHost
    ? "Create a secure DetailEngine setup checkout during a sales call."
    : "DetailEngine's operating system for accounts, warm transfers, media buying, client ROI and daily action briefings.";

  return {
    metadataBase: new URL(origin),
    title,
    description,
    icons: {
      icon: "/detailengine-mark.png",
      shortcut: "/detailengine-mark.png",
    },
    openGraph: {
      title,
      description,
      images: [{ url: `${origin}/og-brand-v1.png`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og-brand-v1.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={barlow.variable}>{children}</body>
    </html>
  );
}
