import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./page.css";

export const metadata: Metadata = {
  title: "Model Runtime Demo",
  description: "AI Companion Core model runtime demo output",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
