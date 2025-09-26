import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/footer";
import { FloatingTitle } from "@/components/floating-title";
import { AppProviders } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://chss.chat'),
  title: {
    template: '%s | chss.chat',
    default: 'chss.chat',
  },
  description: "Play chess over any messaging app. No download, no sign up.",
  icons: {
    icon: "/Pawn.svg",
  },
  appleWebApp: {
    title: "chss.chat",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "chss.chat",
    description: "Play chess over any messaging app. No download, no sign up.",
    images: ["/og/o-rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR|w.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "chss.chat",
    description: "Play chess over any messaging app. No download, no sign up.",
    images: ["/og/o-rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR|w.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppProviders>
          <div className="h-auto flex flex-col w-full">
            <FloatingTitle />
            {children}
            <Footer />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
