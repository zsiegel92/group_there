import { Suspense } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

import { DialogProvider } from "@/components/dialog-provider";
import { Nav, NavFallback } from "@/components/nav/nav";
import { QueryProvider } from "@/components/query-provider";

export const dynamic = "force-dynamic"; // NOTE: disables NextJS `fetch`-caching everywhere!

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GroupThere",
  description: "Optimize carpools for group events",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚗</text></svg>",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <DialogProvider>
            <Suspense fallback={<NavFallback />}>
              <Nav />
            </Suspense>
            {children}
          </DialogProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
