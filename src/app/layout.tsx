import type { Metadata } from "next";
import Link from "next/link";
import { AccountMenu } from "@/components/AccountMenu";
import { PlayerBar } from "@/components/PlayerBar";
import { SellerInput } from "@/components/SellerInput";
import "./globals.css";

export const metadata: Metadata = {
  title: "Discogs Preview",
  description: "Filter a Discogs seller's inventory and listen through it like a playlist.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
            <Link href="/" className="shrink-0 font-semibold tracking-tight text-zinc-100">
              ◉ Discogs Preview
            </Link>
            <div className="hidden max-w-md flex-1 sm:block">
              <SellerInput compact />
            </div>
            <div className="ml-auto">
              <AccountMenu />
            </div>
          </div>
        </header>
        {children}
        <PlayerBar />
      </body>
    </html>
  );
}
