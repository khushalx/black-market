import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "BLACK MARKET — The auction game",
  description:
    "A competitive auction game with real-world objects, equal fictional-dollar wallets, private inspections, and live multiplayer bidding.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
