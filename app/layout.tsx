import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "База знаний магазина",
  description: "Управление инструкциями для сотрудников"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={geist.className}>{children}</body>
    </html>
  );
}
