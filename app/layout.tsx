import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ORA Juicer",
  description: "Deposit ALGO, juice ORA automatically, and claim ORA rewards."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
