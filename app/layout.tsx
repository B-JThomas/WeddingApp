import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Last Dance — Wedding Setlist Review",
  description: "A small private space to choose the songs that feel like you.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
