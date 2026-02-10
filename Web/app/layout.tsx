import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "个人理财录入",
  description: "录入基金和股票并保存到本地数据库",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
