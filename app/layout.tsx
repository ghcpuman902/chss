import type { Metadata } from "next";
import { Besley, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/footer";
import { FloatingTitle } from "@/components/floating-title";
import { AppProviders } from "@/components/providers";
import { DeferredAnalytics } from "@/components/deferred-analytics";
import { START_OG_CODE } from "@/lib/og-encoding";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const besley = Besley({
  variable: "--font-besley",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL('https://chss.chat'),
  title: {
    template: '%s | chss.chat',
    default: 'chss.chat',
  },
  description: "Play chess over any messaging app. No download, no sign up.",
  icons: {
    icon: "/v2/Pawn.svg",
  },
  appleWebApp: {
    title: "chss.chat",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "chss.chat",
    description: "Play chess over any messaging app. No download, no sign up.",
    images: [`/og/${START_OG_CODE}.png`],
  },
  twitter: {
    card: "summary_large_image",
    title: "chss.chat",
    description: "Play chess over any messaging app. No download, no sign up.",
    images: [`/og/${START_OG_CODE}.png`],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth" data-scroll-behavior="smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${besley.variable} antialiased`}
      >
        <AppProviders>
          <div className="h-auto flex flex-col w-full">
            <FloatingTitle />
            {children}
            <Footer />
          </div>
        </AppProviders>
        <DeferredAnalytics />
      </body>
    </html>
  );
}
