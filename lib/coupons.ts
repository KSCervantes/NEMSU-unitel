import { type CouponIconKey, isCouponIconKey } from '@/lib/couponIcons';

export type CouponId = string;

export type CouponConfig = {
  id: CouponId;
  code: string;
  title: string;
  description: string;
  shortDescription: string;
  discountPercent: number;
  validFrom: string | null; // YYYY-MM-DD (Asia/Manila basis)
  validTo: string | null; // YYYY-MM-DD (Asia/Manila basis)
  isActive: boolean;
  terms: string[];
  iconKey?: CouponIconKey;
  createdAt?: unknown;
  updatedAt?: unknown;
};

const MANILA_TIME_ZONE = 'Asia/Manila';

let couponRegistry: Record<CouponId, CouponConfig> = {};
export let REDEEMABLE_COUPON_IDS: CouponId[] = [];

function toDateString(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return null;
  }

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const maybeToDate = (value as { toDate?: unknown }).toDate;
    if (typeof maybeToDate === 'function') {
      const parsed = (maybeToDate as () => Date)();
      if (parsed instanceof Date && Number.isFinite(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
      }
    }
  }

  return null;
}

function normalizePercent(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizeTerms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function getManilaDateString(atDate: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(atDate);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function getCouponNowLabel(atDate: Date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(atDate);
}

export function formatCouponDate(dateValue: string | null | undefined) {
  if (!dateValue) return '';
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateValue;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateValue;
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utcDate);
}

export function buildCouponAvailabilityText(coupon: CouponConfig) {
  if (coupon.validFrom && coupon.validTo) {
    return `Valid from ${formatCouponDate(coupon.validFrom)} to ${formatCouponDate(coupon.validTo)}`;
  }
  if (coupon.validFrom) {
    return `Valid starting ${formatCouponDate(coupon.validFrom)}`;
  }
  if (coupon.validTo) {
    return `Valid until ${formatCouponDate(coupon.validTo)}`;
  }
  return 'Available year-round';
}

export function toCouponDocId(value: string) {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.slice(0, 64);
}

export function parseCouponDoc(id: string, data: Record<string, unknown>): CouponConfig {
  const titleRaw = typeof data.title === 'string' ? data.title.trim() : '';
  const codeRaw = typeof data.code === 'string' ? data.code.trim() : '';
  const shortDescriptionRaw = typeof data.shortDescription === 'string' ? data.shortDescription.trim() : '';
  const descriptionRaw = typeof data.description === 'string' ? data.description.trim() : '';

  const title = titleRaw || 'Untitled Coupon';
  const code = (codeRaw || id).toUpperCase();
  const shortDescription = shortDescriptionRaw || 'Limited-time offer.';
  const description = descriptionRaw || shortDescription;
  const discountPercent = normalizePercent(data.discountPercent);
  const validFrom = toDateString(data.validFrom);
  const validTo = toDateString(data.validTo);
  const isActive = typeof data.isActive === 'boolean' ? data.isActive : true;
  const terms = normalizeTerms(data.terms);
  const iconKeyRaw = typeof data.iconKey === 'string' ? data.iconKey.trim() : '';
  const iconKey = isCouponIconKey(iconKeyRaw) ? iconKeyRaw : undefined;

  return {
    id,
    code,
    title,
    description,
    shortDescription,
    discountPercent,
    validFrom,
    validTo,
    isActive,
    terms,
    iconKey,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function sortCouponsByPriority(coupons: CouponConfig[]) {
  return [...coupons].sort((a, b) => {
    const aAvailability = getCouponAvailability(a);
    const bAvailability = getCouponAvailability(b);
    if (aAvailability.active !== bAvailability.active) {
      return aAvailability.active ? -1 : 1;
    }

    const aStart = a.validFrom || '9999-12-31';
    const bStart = b.validFrom || '9999-12-31';
    if (aStart !== bStart) return aStart.localeCompare(bStart);

    return a.title.localeCompare(b.title);
  });
}

export function setCouponRegistry(coupons: CouponConfig[]) {
  const nextRegistry: Record<CouponId, CouponConfig> = {};
  const nextIds: CouponId[] = [];

  coupons.forEach((coupon) => {
    if (!coupon?.id) return;
    const id = coupon.id.trim();
    if (!id) return;
    nextRegistry[id] = coupon;
    nextIds.push(id);
  });

  couponRegistry = nextRegistry;
  REDEEMABLE_COUPON_IDS = nextIds;
}

export function isCouponId(value: string | null | undefined): value is CouponId {
  return typeof value === 'string' && value.trim().length > 0;
}

export function getCouponById(couponId: CouponId) {
  return couponRegistry[couponId] || null;
}

type CouponAvailability = {
  active: boolean;
  reason?: string;
  availabilityText: string;
};

export function getCouponAvailability(
  couponInput: CouponId | CouponConfig | null | undefined,
  atDate: Date = new Date()
): CouponAvailability {
  const coupon = typeof couponInput === 'string' ? getCouponById(couponInput) : couponInput;

  if (!coupon) {
    return {
      active: false,
      reason: 'Coupon not found.',
      availabilityText: 'Unavailable',
    };
  }

  const availabilityText = buildCouponAvailabilityText(coupon);
  if (!coupon.isActive) {
    return {
      active: false,
      reason: 'Coupon is disabled by admin.',
      availabilityText,
    };
  }

  const today = getManilaDateString(atDate);
  if (coupon.validFrom && today < coupon.validFrom) {
    return {
      active: false,
      reason: `Valid starting ${formatCouponDate(coupon.validFrom)}.`,
      availabilityText,
    };
  }

  if (coupon.validTo && today > coupon.validTo) {
    return {
      active: false,
      reason: `Expired on ${formatCouponDate(coupon.validTo)}.`,
      availabilityText,
    };
  }

  return {
    active: true,
    availabilityText,
  };
}

export function getCouponDiscountAmount(
  subtotal: number,
  couponId: CouponId | null | undefined,
  atDate: Date = new Date()
) {
  if (!couponId || !Number.isFinite(subtotal) || subtotal <= 0) return 0;

  const coupon = getCouponById(couponId);
  if (!coupon) return 0;

  const availability = getCouponAvailability(coupon, atDate);
  if (!availability.active) return 0;

  return Math.round((subtotal * coupon.discountPercent) / 100);
}

export function normalizeGuestEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getCouponUsageDocId(email: string) {
  const normalizedEmail = normalizeGuestEmail(email);
  if (!normalizedEmail) return '';
  return encodeURIComponent(normalizedEmail);
}

export type CouponIdentityType = 'email' | 'name' | 'mobile' | 'phone' | 'address' | 'profile';

export type CouponIdentityLock = {
  identityKey: string;
  identityType: CouponIdentityType;
};

export type CouponIdentityInput = {
  name?: string;
  surname?: string;
  email?: string;
  mobile?: string;
  phone?: string;
  street?: string;
  street1?: string;
  region?: string;
  province?: string;
  city?: string;
  barangay?: string;
  zip?: string;
  country?: string;
};

function normalizeText(value: string | undefined | null) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePhone(value: string | undefined | null) {
  return (value || '').replace(/\D+/g, '');
}

function fnv1aHash(value: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildIdentityKey(type: CouponIdentityType, normalizedValue: string) {
  return `${type}:${fnv1aHash(normalizedValue)}`;
}

export function getCouponIdentityLocks(identity: CouponIdentityInput): CouponIdentityLock[] {
  const locks = new Map<string, CouponIdentityLock>();
  const addLock = (identityType: CouponIdentityType, value: string) => {
    const normalizedValue = value.trim();
    if (!normalizedValue) return;
    const identityKey = buildIdentityKey(identityType, normalizedValue);
    if (!locks.has(identityKey)) {
      locks.set(identityKey, { identityKey, identityType });
    }
  };

  const normalizedEmail = normalizeGuestEmail(identity.email || '');
  if (normalizedEmail) addLock('email', normalizedEmail);

  const normalizedName = `${normalizeText(identity.name)} ${normalizeText(identity.surname)}`.trim();
  if (normalizedName) addLock('name', normalizedName);

  const normalizedMobile = normalizePhone(identity.mobile);
  if (normalizedMobile.length >= 7) addLock('mobile', normalizedMobile);

  const normalizedPhone = normalizePhone(identity.phone);
  if (normalizedPhone.length >= 7 && normalizedPhone !== normalizedMobile) {
    addLock('phone', normalizedPhone);
  }

  const normalizedAddress = [
    normalizeText(identity.street),
    normalizeText(identity.street1),
    normalizeText(identity.barangay),
    normalizeText(identity.city),
    normalizeText(identity.province),
    normalizeText(identity.zip),
    normalizeText(identity.country),
  ].filter(Boolean).join('|');
  if (normalizedAddress) addLock('address', normalizedAddress);

  const normalizedProfile = [
    normalizeText(identity.name),
    normalizeText(identity.surname),
    normalizedEmail,
    normalizedMobile,
    normalizedPhone,
    normalizeText(identity.street),
    normalizeText(identity.street1),
    normalizeText(identity.region),
    normalizeText(identity.province),
    normalizeText(identity.city),
    normalizeText(identity.barangay),
    normalizeText(identity.zip),
    normalizeText(identity.country),
  ].filter(Boolean).join('|');
  if (normalizedProfile) addLock('profile', normalizedProfile);

  return Array.from(locks.values());
}
