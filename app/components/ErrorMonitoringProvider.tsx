"use client";

import { useEffect } from "react";
import { setupErrorMonitoring } from "@/lib/errorMonitoring";

/**
 * ErrorMonitoringProvider - Client-side error monitoring setup
 * This component initializes global error handlers
 */
export function ErrorMonitoringProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setupErrorMonitoring();
  }, []);

  return <>{children}</>;
}
