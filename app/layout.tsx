import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MASA Smart Operator Round",
  description: "Offline-first digital field inspection and operator round system",
  manifest: "/manifest.webmanifest",
  themeColor: "#153a6b",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "MASA Round" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/icon-192.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
