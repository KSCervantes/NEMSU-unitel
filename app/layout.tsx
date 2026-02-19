import type { Metadata } from "next";
import "./globals.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ErrorMonitoringProvider } from "./components/ErrorMonitoringProvider";
import SkipLinks from "./components/SkipLinks";

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
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
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
