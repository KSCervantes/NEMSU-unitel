export type SupportedCurrency = 'PHP' | 'USD' | 'EUR';

export interface HotelSettings {
  hotelName: string;
  checkInTime: string;
  checkOutTime: string;
  currency: SupportedCurrency;
  contactEmail: string;
  contactPhone: string;
  address: string;
}

export const DEFAULT_HOTEL_SETTINGS: HotelSettings = {
  hotelName: 'UNITEL Hotel',
  checkInTime: '15:00',
  checkOutTime: '11:00',
  currency: 'PHP',
  contactEmail: 'hello@nemsu.edu.ph',
  contactPhone: '+63 123 456 7890',
  address: 'NEMSU, Lianga, Philippines',
};

const CURRENCY_TO_LOCALE: Record<SupportedCurrency, string> = {
  PHP: 'en-PH',
  USD: 'en-US',
  EUR: 'de-DE',
};

export function normalizeCurrencyCode(value: unknown): SupportedCurrency {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'USD' || normalized === 'EUR' || normalized === 'PHP') {
    return normalized;
  }
  return DEFAULT_HOTEL_SETTINGS.currency;
}

function normalizeAmount(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function formatHotelCurrency(
  amount: unknown,
  currency: string,
  options: Intl.NumberFormatOptions = {}
): string {
  const code = normalizeCurrencyCode(currency);
  const locale = CURRENCY_TO_LOCALE[code];

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    ...options,
  }).format(normalizeAmount(amount));
}

export function normalizeHotelSettings(value: unknown): HotelSettings {
  const source = (value && typeof value === 'object') ? (value as Partial<HotelSettings>) : {};

  return {
    hotelName: typeof source.hotelName === 'string' && source.hotelName.trim()
      ? source.hotelName.trim()
      : DEFAULT_HOTEL_SETTINGS.hotelName,
    checkInTime: typeof source.checkInTime === 'string' && source.checkInTime.trim()
      ? source.checkInTime.trim()
      : DEFAULT_HOTEL_SETTINGS.checkInTime,
    checkOutTime: typeof source.checkOutTime === 'string' && source.checkOutTime.trim()
      ? source.checkOutTime.trim()
      : DEFAULT_HOTEL_SETTINGS.checkOutTime,
    currency: normalizeCurrencyCode(source.currency),
    contactEmail: typeof source.contactEmail === 'string' && source.contactEmail.trim()
      ? source.contactEmail.trim()
      : DEFAULT_HOTEL_SETTINGS.contactEmail,
    contactPhone: typeof source.contactPhone === 'string' && source.contactPhone.trim()
      ? source.contactPhone.trim()
      : DEFAULT_HOTEL_SETTINGS.contactPhone,
    address: typeof source.address === 'string' && source.address.trim()
      ? source.address.trim()
      : DEFAULT_HOTEL_SETTINGS.address,
  };
}

export function formatHotelTimeLabel(time: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) {
    return time;
  }
  const hour24 = Number.parseInt(match[1], 10);
  const minute = match[2];
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${meridiem}`;
}
