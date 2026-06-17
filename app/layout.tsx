import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "謎解き企画アプリ",
  description: "ルーム参加型の謎解き企画用Webアプリ"
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
