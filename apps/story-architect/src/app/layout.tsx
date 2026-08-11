import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ying Story Architect",
  description: "AI 小说创作伙伴",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
