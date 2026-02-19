"use client";
export const dynamic = "force-dynamic";

import { useCallback } from 'react';
import { useHotelSettings } from '@/app/hooks/useHotelSettings';
import { formatHotelCurrency } from '@/lib/hotelSettings';

export function formatAdminCurrency(
  amount: unknown,
  currency: string,
  options: Intl.NumberFormatOptions = {}
): string {
  return formatHotelCurrency(amount, currency, options);
}

export function useAdminCurrency(enabled = true) {
  const { settings } = useHotelSettings(enabled);
  const currency = settings.currency;

  const formatCurrency = useCallback(
    (amount: unknown, options: Intl.NumberFormatOptions = {}) =>
      formatAdminCurrency(amount, currency, options),
    [currency]
  );

  return {
    currency,
    formatCurrency,
  };
}
