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

// Page zoom stays allowed (accessibility); the canvas handles its own pinch zoom with touch-action: none.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a12",
};

const HAS_SAVE_SCRIPT = `try{if(localStorage.getItem("neon-hq-has-save"))document.documentElement.dataset.save="1"}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${vt323.variable} ${pressStart.variable} ${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        {/* Runs before first paint: returning players get the splash, not a flash of the intro. */}
        <script dangerouslySetInnerHTML={{ __html: HAS_SAVE_SCRIPT }} />
      </head>
      <body className="h-full overflow-hidden antialiased">{children}</body>
    </html>
  );
}
