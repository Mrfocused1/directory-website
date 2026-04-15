import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import RecoverySniffer from "@/components/auth/RecoverySniffer";
import PostHogProvider from "@/components/analytics/PostHogProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://buildmy.directory";

const DEFAULT_TITLE =
  "BuildMy.Directory — Turn your content into a searchable directory";
const DEFAULT_DESCRIPTION =
  "Automatically build a beautiful, searchable directory from your Instagram or TikTok content. Transcriptions, references, categories — all done for you.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: "%s | BuildMy.Directory",
  },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    type: "website",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    siteName: "BuildMy.Directory",
    images: [{ url: "/opengraph-image" }],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:bg-black focus:text-white focus:rounded-lg focus:text-sm focus:font-semibold"
        >
          Skip to content
        </a>
        <RecoverySniffer />
        <PostHogProvider />
        {children}
      </body>
    </html>
  );
}
