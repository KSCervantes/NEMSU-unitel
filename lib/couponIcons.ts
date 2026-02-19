export type CouponIconKey =
  | 'ticket'
  | 'heart'
  | 'star'
  | 'gift'
  | 'bolt'
  | 'calendar'
  | 'sparkles'
  | 'fire'
  | 'sun'
  | 'moon'
  | 'leaf'
  | 'snowflake'
  | 'music'
  | 'camera'
  | 'globe'
  | 'shield'
  | 'trophy'
  | 'tag';

export type CouponIconOption = {
  key: CouponIconKey;
  label: string;
  path: string;
  discountClass: string;
  iconClass: string;
};

export const COUPON_ICON_OPTIONS: CouponIconOption[] = [
  {
    key: 'ticket',
    label: 'Ticket',
    path: 'M4 9a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 010 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 010-4V9z',
    discountClass: 'text-blue-600',
    iconClass: 'text-blue-600',
  },
  {
    key: 'heart',
    label: 'Heart',
    path: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
    discountClass: 'text-rose-600',
    iconClass: 'text-rose-600',
  },
  {
    key: 'star',
    label: 'Star',
    path: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l2.02 6.215a1 1 0 00.95.69h6.533c.969 0 1.371 1.24.588 1.81l-5.285 3.84a1 1 0 00-.364 1.118l2.02 6.214c.3.922-.755 1.688-1.539 1.118l-5.285-3.84a1 1 0 00-1.176 0l-5.285 3.84c-.783.57-1.838-.196-1.539-1.118l2.02-6.214a1 1 0 00-.364-1.118l-5.285-3.84c-.783-.57-.38-1.81.588-1.81h6.533a1 1 0 00.95-.69l2.02-6.215z',
    discountClass: 'text-amber-600',
    iconClass: 'text-amber-600',
  },
  {
    key: 'gift',
    label: 'Gift',
    path: 'M12 8v13m-8-8h16M5 8h14a1 1 0 011 1v3H4V9a1 1 0 011-1zm4 0a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z',
    discountClass: 'text-fuchsia-600',
    iconClass: 'text-fuchsia-600',
  },
  {
    key: 'bolt',
    label: 'Bolt',
    path: 'M13 10V3L4 14h7v7l9-11h-7z',
    discountClass: 'text-indigo-600',
    iconClass: 'text-indigo-600',
  },
  {
    key: 'calendar',
    label: 'Calendar',
    path: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    discountClass: 'text-cyan-600',
    iconClass: 'text-cyan-600',
  },
  {
    key: 'sparkles',
    label: 'Sparkles',
    path: 'M5 3l1.5 3L10 7.5 6.5 9 5 12 3.5 9 0 7.5 3.5 6 5 3zm14 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2zM14 13l1.2 2.4L18 16.6l-2.8 1.2L14 20l-1.2-2.2L10 16.6l2.8-1.2L14 13z',
    discountClass: 'text-violet-600',
    iconClass: 'text-violet-600',
  },
  {
    key: 'fire',
    label: 'Fire',
    path: 'M12 2c.5 2.5-.5 4-2 5.5C8 9 7 10.5 7 12.5A5 5 0 0012 18a5 5 0 005-5.5c0-2.3-1.1-4.2-3-5.8.1 1.7-.3 3-1.3 4-1.4-1-2.2-2.6-2-4.7',
    discountClass: 'text-orange-600',
    iconClass: 'text-orange-600',
  },
  {
    key: 'sun',
    label: 'Sun',
    path: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.657-5.657l1.414-1.414M4.929 19.071l1.414-1.414m0-11.314L4.929 4.929m14.142 14.142l-1.414-1.414M12 17a5 5 0 100-10 5 5 0 000 10z',
    discountClass: 'text-yellow-600',
    iconClass: 'text-yellow-600',
  },
  {
    key: 'moon',
    label: 'Moon',
    path: 'M20.354 15.354A9 9 0 018.646 3.646a9 9 0 1011.708 11.708z',
    discountClass: 'text-slate-600',
    iconClass: 'text-slate-600',
  },
  {
    key: 'leaf',
    label: 'Leaf',
    path: 'M5 21c10 0 14-8 14-16-8 0-16 4-16 14 0 1.1.9 2 2 2zm0 0c0-4 2-7 6-9',
    discountClass: 'text-emerald-600',
    iconClass: 'text-emerald-600',
  },
  {
    key: 'snowflake',
    label: 'Snowflake',
    path: 'M12 2v20M4.93 6.93l14.14 14.14M19.07 6.93L4.93 21.07M2 12h20',
    discountClass: 'text-sky-600',
    iconClass: 'text-sky-600',
  },
  {
    key: 'music',
    label: 'Music',
    path: 'M9 19V6l12-2v13M9 19a2 2 0 11-4 0 2 2 0 014 0zm12-2a2 2 0 11-4 0 2 2 0 014 0z',
    discountClass: 'text-pink-600',
    iconClass: 'text-pink-600',
  },
  {
    key: 'camera',
    label: 'Camera',
    path: 'M3 7h4l2-3h6l2 3h4v12H3V7zm9 10a4 4 0 100-8 4 4 0 000 8z',
    discountClass: 'text-lime-600',
    iconClass: 'text-lime-600',
  },
  {
    key: 'globe',
    label: 'Globe',
    path: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-9c2 2.4 3 5 3 9s-1 6.6-3 9m0-18c-2 2.4-3 5-3 9s1 6.6 3 9m-8-9h16',
    discountClass: 'text-teal-600',
    iconClass: 'text-teal-600',
  },
  {
    key: 'shield',
    label: 'Shield',
    path: 'M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3zm-2 9l2 2 4-4',
    discountClass: 'text-blue-700',
    iconClass: 'text-blue-700',
  },
  {
    key: 'trophy',
    label: 'Trophy',
    path: 'M8 21h8M12 17v4m-4-17h8v3a4 4 0 01-8 0V4zm-3 1H4a2 2 0 000 4h1m14-4h1a2 2 0 010 4h-1',
    discountClass: 'text-yellow-700',
    iconClass: 'text-yellow-700',
  },
  {
    key: 'tag',
    label: 'Tag',
    path: 'M7 7h.01M3 11l8.586 8.586a2 2 0 002.828 0l6.172-6.172a2 2 0 000-2.828L12 2H3v9z',
    discountClass: 'text-rose-700',
    iconClass: 'text-rose-700',
  },
];

const ICON_BY_KEY = new Map<CouponIconKey, CouponIconOption>(
  COUPON_ICON_OPTIONS.map((icon) => [icon.key, icon])
);

export function isCouponIconKey(value: string | null | undefined): value is CouponIconKey {
  if (!value) return false;
  return ICON_BY_KEY.has(value as CouponIconKey);
}

export function getCouponIconMeta(
  iconKey?: string | null,
  fallbackIndex: number = 0
): CouponIconOption {
  if (iconKey && isCouponIconKey(iconKey)) {
    return ICON_BY_KEY.get(iconKey)!;
  }

  const total = COUPON_ICON_OPTIONS.length;
  const normalizedIndex = ((fallbackIndex % total) + total) % total;
  return COUPON_ICON_OPTIONS[normalizedIndex];
}

