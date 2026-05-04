import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "小红书对标分析",
  description: "AI 驱动的小红书对标账号分析与内容生成工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
