import { CouponId, getCouponDiscountAmount } from '@/lib/coupons';

export const EXTRA_GUEST_FEE = 200;

type CalculateBookingPaymentInput = {
  checkIn: string;
  checkOut: string;
  guests: number;
  roomPrice: number;
  maxGuests: number;
  perBed?: string;
  couponId?: CouponId | null;
};

export type BookingPaymentBreakdown = {
  nights: number;
  guests: number;
  basePrice: number;
  extraFee: number;
  subtotal: number;
  couponDiscount: number;
  total: number;
  extraGuests: number;
};

export function calculateBookingPayment({
  checkIn,
  checkOut,
  guests,
  roomPrice,
  maxGuests,
  perBed,
  couponId,
}: CalculateBookingPaymentInput): BookingPaymentBreakdown {
  const checkInTime = new Date(checkIn).getTime();
  const checkOutTime = new Date(checkOut).getTime();
  const msPerDay = 1000 * 60 * 60 * 24;

  if (!Number.isFinite(checkInTime) || !Number.isFinite(checkOutTime) || checkOutTime <= checkInTime) {
    return {
      nights: 0,
      guests: Math.max(1, guests || 1),
      basePrice: 0,
      extraFee: 0,
      subtotal: 0,
      couponDiscount: 0,
      total: 0,
      extraGuests: 0,
    };
  }

  const nights = Math.max(1, Math.ceil((checkOutTime - checkInTime) / msPerDay));
  const safeGuests = Math.max(1, guests || 1);
  const safeRoomPrice = Number.isFinite(roomPrice) ? roomPrice : 0;
  const safeMaxGuests = Number.isFinite(maxGuests) && maxGuests > 0 ? maxGuests : 1;

  let basePrice = 0;
  let extraFee = 0;
  let extraGuests = 0;

  if (perBed) {
    basePrice = safeRoomPrice * safeGuests * nights;
  } else {
    basePrice = safeRoomPrice * nights;
    extraGuests = Math.max(0, safeGuests - safeMaxGuests);
    extraFee = extraGuests * EXTRA_GUEST_FEE * nights;
  }

  const subtotal = basePrice + extraFee;
  const couponDiscount = getCouponDiscountAmount(subtotal, couponId);
  const total = Math.max(0, subtotal - couponDiscount);

  return {
    nights,
    guests: safeGuests,
    basePrice,
    extraFee,
    subtotal,
    couponDiscount,
    total,
    extraGuests,
  };
}
