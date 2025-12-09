import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import SkipLinks from "./components/SkipLinks";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "UNITEL - NEMSU University Hotel | Book Your Stay",
  description: "Experience comfort at UNITEL NEMSU University Hotel. Modern rooms, excellent service, and convenient location in Lianga, Surigao del Sur. Book now!",
  keywords: ["unitel hotel", "nemsu hotel", "lianga hotel", "university hotel", "surigao del sur"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${inter.variable} ${poppins.variable} antialiased`}
      >
        <SkipLinks />
        <ErrorBoundary>
          <main id="main-content">
            {children}
          </main>
        </ErrorBoundary>
      </body>
    </html>
  );
}
