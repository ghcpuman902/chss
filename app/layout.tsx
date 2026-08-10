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

const siteDescription =
  "Play chess over any messaging app. Share a link, your chat unfurls the board from their side. No download, no sign up.";

export const metadata: Metadata = {
  metadataBase: new URL("https://chss.chat"),
  title: {
    template: "%s | chss.chat",
    default: "chss.chat — chess in a link",
  },
  description: siteDescription,
  applicationName: "chss.chat",
  alternates: {
    canonical: "/",
  },
  appleWebApp: {
    title: "chss.chat",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "chss.chat",
    title: "chss.chat — chess in a link",
    description: siteDescription,
    images: [`/og/${START_OG_CODE}.png`],
  },
  twitter: {
    card: "summary_large_image",
    title: "chss.chat — chess in a link",
    description: siteDescription,
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
