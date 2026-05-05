import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ErrorMonitoringProvider } from "./components/ErrorMonitoringProvider";
import SkipLinks from "./components/SkipLinks";

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "UNITEL - NEMSU University Hotel | Book Your Stay",
  description: "Experience comfort at UNITEL NEMSU University Hotel. Modern rooms, excellent service, and convenient location in Lianga, Surigao del Sur. Book now!",
  keywords: ["unitel hotel", "nemsu hotel", "lianga hotel", "university hotel", "surigao del sur"],
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfairDisplay.variable} scroll-smooth`} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <ErrorMonitoringProvider>
          <SkipLinks />
          <ErrorBoundary>
            <main id="main-content">
              {children}
            </main>
          </ErrorBoundary>
        </ErrorMonitoringProvider>
      </body>
    </html>
  );
}
