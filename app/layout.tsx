import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "謎解き早解き感謝祭",
  description: "謎解き早解き感謝祭 参加者用Webアプリ"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
