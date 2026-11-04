import type { Metadata, Viewport } from "next";
import { Inter, Press_Start_2P, VT323 } from "next/font/google";
import "./globals.css";

const vt323 = VT323({ weight: "400", subsets: ["latin"], variable: "--font-vt323", display: "swap" });
const pressStart = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-press-start", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "NEON HQ",
  description: "A neon pixel-art startup tycoon. Run a warehouse full of AI workers. All money is fictional.",
  applicationName: "NEON HQ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0a0a12",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${vt323.variable} ${pressStart.variable} ${inter.variable} h-full`}>
      <body className="h-full overflow-hidden antialiased">{children}</body>
    </html>
  );
}
