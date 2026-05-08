"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import Swal from 'sweetalert2';
import { DayPicker } from 'react-day-picker';
import type { DateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import Image from "next/image";
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { useFocusTrap } from '@/app/hooks/useFocusTrap';
import { useKeyboardNavigation } from '@/app/hooks/useKeyboardNavigation';
import { logError } from '@/lib/logger';
import { Room } from '@/lib/types/room';
import dayjs, { Dayjs } from 'dayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { MobileTimePicker } from '@mui/x-date-pickers/MobileTimePicker';
import { calculateBookingPayment, EXTRA_GUEST_FEE } from '@/lib/bookingPricing';
import { useCoupons } from '@/app/hooks/useCoupons';
import { DEFAULT_HOTEL_SETTINGS, formatHotelCurrency, type SupportedCurrency } from '@/lib/hotelSettings';
import {
  CouponId,
  type CouponIdentityInput,
  type CouponIdentityLock,
  getCouponAvailability,
  getCouponIdentityLocks,
  getCouponNowLabel,
  isCouponId,
  normalizeGuestEmail
} from '@/lib/coupons';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRoom?: string;
  selectedCouponId?: CouponId | "";
  hotelName?: string;
  currency?: SupportedCurrency;
  contactEmail?: string;
  contactPhone?: string;
  defaultCheckInTime?: string;
  defaultCheckOutTime?: string;
}

interface Region {
  code: string;
  name: string;
  regionName: string;
}

interface Province {
  code: string;
  name: string;
}

interface City {
  code: string;
  name: string;
}

interface Barangay {
  code: string;
  name: string;
}

function parseSettingTime(time: string | undefined, fallbackHour: number, fallbackMinute: number) {
  const match = typeof time === 'string' ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim()) : null;
  const next = dayjs();
  if (!match) {
    return next.set('hour', fallbackHour).set('minute', fallbackMinute).set('second', 0).set('millisecond', 0);
  }
  return next
    .set('hour', Number.parseInt(match[1], 10))
    .set('minute', Number.parseInt(match[2], 10))
    .set('second', 0)
    .set('millisecond', 0);
}

async function findExistingCouponIdentityLock(identity: CouponIdentityInput): Promise<CouponIdentityLock | null> {
  const identityLocks = getCouponIdentityLocks(identity);
  for (const identityLock of identityLocks) {
    const identityRef = doc(db, 'couponIdentityLocks', identityLock.identityKey);
    const identitySnapshot = await getDoc(identityRef);
    if (identitySnapshot.exists()) {
      return identityLock;
    }
  }
  return null;
}

export default function BookingModal({
  isOpen,
  onClose,
  selectedRoom,
  selectedCouponId = "",
  hotelName = DEFAULT_HOTEL_SETTINGS.hotelName,
  currency = DEFAULT_HOTEL_SETTINGS.currency,
  contactEmail = DEFAULT_HOTEL_SETTINGS.contactEmail,
  contactPhone = DEFAULT_HOTEL_SETTINGS.contactPhone,
  defaultCheckInTime = DEFAULT_HOTEL_SETTINGS.checkInTime,
  defaultCheckOutTime = DEFAULT_HOTEL_SETTINGS.checkOutTime,
}: BookingModalProps) {
  // Enable keyboard navigation
  useKeyboardNavigation();

  // State for rooms fetched from Firestore
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);

  const [formData, setFormData] = useState({
    name: "",
    surname: "",
    email: "",
    phone: "",
    mobile: "",
    street: "",
    street1: "",
    region: "",
    province: "",
    city: "",
    barangay: "",
    zip: "",
    country: "Philippines",
    fax: "",
    jobTitle: "",
    company: "",
    checkIn: "",
    checkOut: "",
    room: selectedRoom || "",
    guests: "1",
    couponId: selectedCouponId || "",
    message: "",
  });

  const [regions, setRegions] = useState<Region[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [loading, setLoading] = useState(false);
  const [maintenanceConflict, setMaintenanceConflict] = useState<string | null>(null);
  const [couponIdentityConflict, setCouponIdentityConflict] = useState<string | null>(null);
  const [checkingCouponIdentity, setCheckingCouponIdentity] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();
  const [checkInTime, setCheckInTime] = useState<Dayjs | null>(() => parseSettingTime(defaultCheckInTime, 15, 0));
  const [checkOutTime, setCheckOutTime] = useState<Dayjs | null>(() => parseSettingTime(defaultCheckOutTime, 11, 0));
  const [maintenanceByRoom, setMaintenanceByRoom] = useState<Record<string, { start: number; end: number }[]>>({});
  const { coupons, couponMap, availabilityMap, loading: couponsLoading } = useCoupons(isOpen);
  const formatCurrency = useCallback(
    (amount: unknown, options: Intl.NumberFormatOptions = {}) =>
      formatHotelCurrency(amount, currency, options),
    [currency]
  );

  // Get room data from fetched rooms - defined early so it's available throughout the component
  const getRoomData = (roomName: string) => {
    const room = rooms.find(r => r.name === roomName);
    if (!room) return null;

    return {
      image: room.image,
      price: room.priceNumber || parseFloat(room.price.replace(/,/g, '')) || 0,
      maxGuests: room.maxGuests,
      perBed: room.perBed,
    };
  };

  // Update room when selectedRoom prop changes
  useEffect(() => {
    if (selectedRoom) {
      setFormData(prev => ({ ...prev, room: selectedRoom }));
    }
  }, [selectedRoom]);

  useEffect(() => {
    if (!isOpen) return;
    setCheckInTime(parseSettingTime(defaultCheckInTime, 15, 0));
    setCheckOutTime(parseSettingTime(defaultCheckOutTime, 11, 0));
  }, [defaultCheckInTime, defaultCheckOutTime, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setFormData((prev) => ({
      ...prev,
      couponId: selectedCouponId && isCouponId(selectedCouponId) ? selectedCouponId : "",
    }));
  }, [isOpen, selectedCouponId]);

  useEffect(() => {
    if (couponsLoading) return;
    if (!formData.couponId) return;
    if (!couponMap[formData.couponId]) {
      setFormData((prev) => ({ ...prev, couponId: "" }));
    }
  }, [couponMap, couponsLoading, formData.couponId]);

  // Fetch rooms from Firestore when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const fetchRooms = async () => {
      try {
        setRoomsLoading(true);
        const roomsSnapshot = await getDocs(collection(db, 'rooms'));
        const roomsData: Room[] = [];
        roomsSnapshot.forEach((doc) => roomsData.push({ id: doc.id, ...doc.data() } as Room));
        // Deduplicate by room name to avoid duplicate options
        const unique = Array.from(new Map(roomsData.map((r) => [r.name, r])).values());
        setRooms(unique);
      } catch (error) {
        logError('Error fetching rooms for booking modal:', error);
        setRooms([]);
      } finally {
        setRoomsLoading(false);
      }
    };
    fetchRooms();
  }, [isOpen]);

  // Subscribe to maintenance windows (if date ranges exist) to disable those days too
  useEffect(() => {
    if (!isOpen) return;
    const q = query(collection(db, 'maintenance'), where('status', 'in', ['pending', 'in-progress']));
    type MaintenanceSnapshot = { room?: string; start?: string; end?: string; dueDate?: string; status?: string };
    const unsub = onSnapshot(q, (snap) => {
      const map: Record<string, { start: number; end: number }[]> = {};
      snap.forEach((doc) => {
        const d = doc.data() as MaintenanceSnapshot;
        if (!d?.room) return;

        let start: number;
        let end: number;

        // If start/end fields exist, use them
        if (d.start && d.end) {
          start = new Date(d.start).getTime();
          end = new Date(d.end).getTime();
        }
        // If only dueDate exists, block the entire due date day
        else if (d.dueDate) {
          const dueDate = new Date(d.dueDate);
          start = new Date(dueDate).setHours(0, 0, 0, 0);
          end = new Date(dueDate).setHours(23, 59, 59, 999);
        }
        // Fall back to current day
        else {
          start = new Date().setHours(0, 0, 0, 0);
          end = new Date().setHours(23, 59, 59, 999);
        }

        if (!Number.isFinite(start) || !Number.isFinite(end)) return;
        if (!map[d.room]) map[d.room] = [];
        map[d.room].push({ start, end });
      });
      setMaintenanceByRoom(map);
    });
    return () => unsub();
  }, [isOpen]);

  // Validate date selection against maintenance windows
  useEffect(() => {
    if (!formData.room || !formData.checkIn || !formData.checkOut) {
      setMaintenanceConflict(null);
      return;
    }

    const start = new Date(formData.checkIn).getTime();
    const end = new Date(formData.checkOut).getTime();
    const maintRanges = maintenanceByRoom[formData.room] || [];
    const overlapsMaintenance = maintRanges.some(r => start < r.end && end > r.start);
    if (overlapsMaintenance) {
      setMaintenanceConflict('Selected dates overlap with a maintenance period. Booking is not allowed during maintenance.');
    } else {
      setMaintenanceConflict(null);
    }
  }, [formData.room, formData.checkIn, formData.checkOut, maintenanceByRoom]);

  // Update form dates when the day picker range changes; checkout is exclusive
  useEffect(() => {
    if (!range?.from || !range?.to || !checkInTime || !checkOutTime) return;
    const ciH = checkInTime.hour();
    const ciM = checkInTime.minute();
    const coH = checkOutTime.hour();
    const coM = checkOutTime.minute();
    const from = new Date(range.from);
    from.setHours(ciH, ciM, 0, 0);
    const to = new Date(range.to);
    to.setHours(coH, coM, 0, 0);
    setFormData((prev) => ({
      ...prev,
      checkIn: from.toISOString(),
      checkOut: to.toISOString(),
    }));
  }, [range, checkInTime, checkOutTime]);

  // Build disabled day intervals for maintenance windows (checkout exclusive)
  const disabledRanges = () => {
    const m = maintenanceByRoom[formData.room] || [];
    const toIntervals = (list: { start: number; end: number }[]) => list.map((iv) => {
      const from = new Date(iv.start);
      from.setHours(0, 0, 0, 0);
      const to = new Date(iv.end);
      // make checkout day available again: disable until the day before checkout
      const last = new Date(to);
      last.setDate(last.getDate() - 1);
      last.setHours(23, 59, 59, 999);
      return { from, to: last };
    });
    return toIntervals(m);
  };

  // Get selected room data from fetched rooms
  const selectedRoomData = formData.room ? getRoomData(formData.room) : null;
  const activeCouponId = isCouponId(formData.couponId) ? formData.couponId : null;
  const activeCoupon = activeCouponId ? couponMap[activeCouponId] || null : null;
  const activeCouponAvailability = activeCouponId
    ? (availabilityMap[activeCouponId] || getCouponAvailability(activeCoupon))
    : null;
  const canApplyActiveCoupon = Boolean(activeCouponId && activeCouponAvailability?.active && !couponIdentityConflict);

  useEffect(() => {
    let cancelled = false;

    const checkIdentity = async () => {
      if (!activeCouponId) {
        setCouponIdentityConflict(null);
        setCheckingCouponIdentity(false);
        return;
      }

      const identity = {
        name: formData.name,
        surname: formData.surname,
        email: formData.email,
        mobile: formData.mobile,
        phone: formData.phone,
        street: formData.street,
        street1: formData.street1,
        region: formData.region,
        province: formData.province,
        city: formData.city,
        barangay: formData.barangay,
        zip: formData.zip,
        country: formData.country,
      };

      if (getCouponIdentityLocks(identity).length === 0) {
        setCouponIdentityConflict(null);
        setCheckingCouponIdentity(false);
        return;
      }

      setCheckingCouponIdentity(true);
      try {
        const existingLock = await findExistingCouponIdentityLock(identity);
        if (cancelled) return;
        setCouponIdentityConflict(
          existingLock
            ? `This guest already used a coupon before. Coupon discounts are one-time only per ${existingLock.identityType}.`
            : null
        );
      } catch (error) {
        logError('Error checking coupon identity lock:', error);
        if (!cancelled) {
          setCouponIdentityConflict(null);
        }
      } finally {
        if (!cancelled) {
          setCheckingCouponIdentity(false);
        }
      }
    };

    void checkIdentity();

    return () => {
      cancelled = true;
    };
  }, [
    activeCouponId,
    formData.name,
    formData.surname,
    formData.email,
    formData.mobile,
    formData.phone,
    formData.street,
    formData.street1,
    formData.region,
    formData.province,
    formData.city,
    formData.barangay,
    formData.zip,
    formData.country,
  ]);

  // Calculate nights and total price
  const calculateStay = () => {
    if (!formData.checkIn || !formData.checkOut || !selectedRoomData) {
      return {
        nights: 0,
        totalPrice: 0,
        extraGuests: 0,
        extraGuestFee: 0,
        basePrice: 0,
        subtotal: 0,
        couponDiscount: 0,
      };
    }

    const payment = calculateBookingPayment({
      checkIn: formData.checkIn,
      checkOut: formData.checkOut,
      guests: parseInt(formData.guests, 10) || 1,
      roomPrice: selectedRoomData.price,
      maxGuests: selectedRoomData.maxGuests,
      perBed: selectedRoomData.perBed,
      couponId: canApplyActiveCoupon ? activeCouponId : null,
    });

    return {
      nights: payment.nights,
      totalPrice: payment.total,
      extraGuests: payment.extraGuests,
      extraGuestFee: payment.extraFee,
      basePrice: payment.basePrice,
      subtotal: payment.subtotal,
      couponDiscount: payment.couponDiscount,
    };
  };

  const { nights, totalPrice, extraGuests, extraGuestFee, couponDiscount } = calculateStay();

  // Fetch regions on component mount
  useEffect(() => {
    if (isOpen && formData.country === "Philippines") {
      fetchRegions();
    }
  }, [isOpen, formData.country]);

  const fetchRegions = async () => {
    try {
      setLoading(true);
      const response = await fetch("https://psgc.cloud/api/regions");
      const data = await response.json();
      setRegions(data);
    } catch (error) {
      logError("Error fetching regions:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProvinces = async (regionCode: string) => {
    try {
      setLoading(true);
      const response = await fetch(`https://psgc.cloud/api/regions/${regionCode}/provinces`);
      const data = await response.json();
      setProvinces(data);
      setCities([]);
      setBarangays([]);
    } catch (error) {
      logError("Error fetching provinces:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCities = async (provinceCode: string) => {
    try {
      setLoading(true);
      const response = await fetch(`https://psgc.cloud/api/provinces/${provinceCode}/cities-municipalities`);
      const data = await response.json();
      setCities(data);
      setBarangays([]);
    } catch (error) {
      logError("Error fetching cities:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBarangays = async (cityCode: string) => {
    try {
      setLoading(true);
      const response = await fetch(`https://psgc.cloud/api/cities-municipalities/${cityCode}/barangays`);
      const data = await response.json();
      setBarangays(data);
    } catch (error) {
      logError("Error fetching barangays:", error);
    } finally {
      setLoading(false);
    }
  };

  // Focus trap for modal (must be called before any early returns to follow Rules of Hooks)
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Final guard to prevent maintenance overlap
      const start = new Date(formData.checkIn).getTime();
      const end = new Date(formData.checkOut).getTime();
      // Basic date validation: checkout must be after check-in
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        Swal.fire({
          icon: 'warning',
          title: 'Invalid Dates',
          text: 'Check-out date/time must be after check-in.',
          confirmButtonColor: '#f59e0b'
        });
        setLoading(false);
        return;
      }
      const maintRanges = maintenanceByRoom[formData.room] || [];
      const overlapsMaintenance = maintRanges.some(r => start < r.end && end > r.start);
      if (overlapsMaintenance) {
        Swal.fire({
          icon: 'warning',
          title: 'Maintenance Period',
          text: 'Selected dates overlap with a maintenance period. Booking is not allowed during maintenance.',
          confirmButtonColor: '#f59e0b'
        });
        setLoading(false);
        return;
      }
      // Calculate payment and coupon validation
      const roomInfo = getRoomData(formData.room);
      if (!roomInfo) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Selected room not found. Please select a valid room.',
        });
        setLoading(false);
        return;
      }

      const guests = parseInt(formData.guests) || 1;

      // Dorm room policy: disable availability if guests exceed 6
      if (roomInfo.perBed && guests > 6) {
        Swal.fire({
          icon: 'warning',
          title: 'Guest Limit Exceeded',
          text: 'Dorm rooms are not available for more than 6 guests. Please reduce the number of guests or choose another room.',
          confirmButtonColor: '#f59e0b'
        });
        setLoading(false);
        return;
      }

      const couponId = isCouponId(formData.couponId) ? formData.couponId : null;
      const couponMeta = couponId ? couponMap[couponId] || null : null;
      if (couponId && !couponMeta) {
        Swal.fire({
          icon: 'warning',
          title: 'Coupon Not Found',
          text: 'This coupon no longer exists. Please choose another coupon.',
          confirmButtonColor: '#f59e0b'
        });
        setLoading(false);
        return;
      }

      const couponAvailability = couponId
        ? (availabilityMap[couponId] || getCouponAvailability(couponMeta))
        : null;
      if (couponId && !couponAvailability?.active) {
        Swal.fire({
          icon: 'warning',
          title: 'Coupon Not Available',
          text: `${couponAvailability?.reason || 'This coupon cannot be used right now.'} Today in Asia/Manila is ${getCouponNowLabel()}.`,
          confirmButtonColor: '#f59e0b'
        });
        setLoading(false);
        return;
      }

      const normalizedEmail = normalizeGuestEmail(formData.email);
      if (couponId) {
        const existingLock = await findExistingCouponIdentityLock({
          name: formData.name,
          surname: formData.surname,
          email: formData.email,
          mobile: formData.mobile,
          phone: formData.phone,
          street: formData.street,
          street1: formData.street1,
          region: formData.region,
          province: formData.province,
          city: formData.city,
          barangay: formData.barangay,
          zip: formData.zip,
          country: formData.country,
        });

        if (existingLock) {
          Swal.fire({
            icon: 'warning',
            title: 'Coupon Already Used',
            text: `This guest already used a coupon before. Remove the coupon to continue booking without a discount.`,
            confirmButtonColor: '#f59e0b'
          });
          setLoading(false);
          return;
        }
      }

      const payment = calculateBookingPayment({
        checkIn: formData.checkIn,
        checkOut: formData.checkOut,
        guests,
        roomPrice: roomInfo.price,
        maxGuests: roomInfo.maxGuests,
        perBed: roomInfo.perBed,
        couponId: couponAvailability?.active && !couponIdentityConflict ? couponId : null,
      });

      // Save booking to Firestore. Admin confirmation still finalizes the one-time coupon lock.
      const roomSlug = (formData.room || '').toLowerCase().trim().replace(/\s+/g, '-');
      const bookingRef = doc(collection(db, 'bookings'));
      const batch = writeBatch(db);

      batch.set(bookingRef, {
        ...formData,
        emailLower: normalizedEmail,
        roomSlug,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        coupon: couponMeta ? {
          applied: true,
          id: couponMeta.id,
          title: couponMeta.title,
          discountPercent: couponMeta.discountPercent,
          discountAmount: payment.couponDiscount,
          availabilityText: couponAvailability?.availabilityText || ''
        } : {
          applied: false
        },
        payment: {
          nights: payment.nights,
          guests: payment.guests,
          basePrice: payment.basePrice,
          extraFee: payment.extraFee,
          subtotal: payment.subtotal,
          couponDiscount: payment.couponDiscount,
          total: payment.total
        }
      });
      await batch.commit();

      // Send confirmation email to guest
      try {
        const emailResponse = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: formData.email,
            type: 'confirmation',
            bookingId: bookingRef.id,
            guestName: `${formData.name} ${formData.surname}`.trim(),
            roomType: formData.room,
            checkIn: new Date(formData.checkIn).toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            }),
            checkOut: new Date(formData.checkOut).toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            }),
            guests: parseInt(formData.guests, 10),
            hotelName,
            contactEmail,
            contactPhone,
            checkInTime: defaultCheckInTime,
            checkOutTime: defaultCheckOutTime,
            currency,
          })
        });

        if (!emailResponse.ok) {
          logError('Failed to send confirmation email');
        }
      } catch (emailError) {
        logError('Email sending error:', emailError);
        // Don't block the booking flow if email fails
      }

      Swal.fire({
        icon: 'success',
        title: 'Booking Submitted!',
        html: `<div class="text-left"><p><strong>Booking ID:</strong> ${bookingRef.id}</p><p><strong>Confirmation will be sent to:</strong> ${formData.email}</p><p><strong>Total Amount:</strong> ${formatCurrency(payment.total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>${couponMeta ? `<p><strong>Coupon Applied:</strong> ${couponMeta.title} (${couponMeta.discountPercent}% OFF)</p>` : ''}<p class="text-sm text-gray-600 mt-2">We'll contact you soon with booking confirmation.</p></div>`,
        confirmButtonColor: '#3b82f6'
      });

      // Reset form
      setFormData({
        name: "",
        surname: "",
        email: "",
        phone: "",
        mobile: "",
        street: "",
        street1: "",
        region: "",
        province: "",
        city: "",
        barangay: "",
        zip: "",
        country: "Philippines",
        fax: "",
        jobTitle: "",
        company: "",
        checkIn: "",
        checkOut: "",
        room: selectedRoom || "",
        guests: "1",
        couponId: selectedCouponId && isCouponId(selectedCouponId) ? selectedCouponId : "",
        message: "",
      });

      onClose();
    } catch (error) {
      logError("Error submitting booking:", error);
      Swal.fire({
        icon: 'error',
        title: 'Booking Failed',
        text: 'Failed to submit booking. Please try again.',
        confirmButtonColor: '#3b82f6'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    // Cascade loading for address fields
    if (name === "region") {
      fetchProvinces(value);
      setFormData({ ...formData, region: value, province: "", city: "", barangay: "" });
    } else if (name === "province") {
      fetchCities(value);
      setFormData({ ...formData, [name]: value, city: "", barangay: "" });
    } else if (name === "city") {
      fetchBarangays(value);
      setFormData({ ...formData, [name]: value, barangay: "" });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-xl sm:rounded-2xl max-w-5xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl animate-slideUp"
      >
        <div className="sticky top-0 bg-blue-900 text-white p-4 sm:p-5 md:p-6 flex items-center justify-between rounded-t-xl sm:rounded-t-2xl gap-3">
          <h2 id="booking-modal-title" className="text-lg sm:text-xl md:text-2xl font-bold font-poppins flex-1">Book Your Stay</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-amber-400 transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-amber-400 rounded"
            aria-label="Close booking modal"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
          {/* Selected Room Preview */}
          {selectedRoomData && (
            <div className="mb-4 sm:mb-5 md:mb-6 bg-linear-to-r from-blue-50 to-blue-100 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-5 border border-blue-200">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 md:gap-6">
                <div className="relative w-full sm:w-32 md:w-40 h-32 sm:h-24 md:h-28 rounded-lg sm:rounded-xl overflow-hidden shrink-0 shadow-lg">
                  <Image
                    src={selectedRoomData.image}
                    alt={formData.room}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 160px, 160px"
                    className="object-cover"
                  />
                </div>
                <div className="grow">
                  <p className="text-xs sm:text-sm font-semibold text-blue-600 mb-1">Selected Room</p>
                  <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-blue-900 mb-2">{formData.room}</h3>
                  <div className="flex items-baseline gap-2 mb-2 sm:mb-3">
                    <span className="text-2xl sm:text-3xl font-bold text-blue-900">{formatCurrency(selectedRoomData.price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    {selectedRoomData.perBed && (
                      <span className="text-xs sm:text-sm text-gray-600">{selectedRoomData.perBed}</span>
                    )}
                    <span className="text-xs sm:text-sm text-gray-600">per night</span>
                  </div>
                  {nights > 0 && (
                    <div className="bg-white rounded-lg p-2 sm:p-3 border border-blue-300 text-sm">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs sm:text-sm text-gray-600">Number of nights:</span>
                        <span className="text-sm sm:text-lg font-bold text-blue-900">{nights} {nights === 1 ? 'night' : 'nights'}</span>
                      </div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs sm:text-sm text-gray-600">Number of guests:</span>
                        <span className="text-sm sm:text-md font-semibold text-blue-900">{formData.guests}</span>
                      </div>
                      {selectedRoomData.perBed && (
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs text-gray-500 italic">Price per bed x guests x nights</span>
                        </div>
                      )}
                      {extraGuests > 0 && !selectedRoomData.perBed && (
                        <>
                          <div className="flex justify-between items-center mb-1 text-orange-600 text-xs sm:text-sm">
                            <span>Extra guests ({extraGuests}):</span>
                            <span className="font-semibold">{formatCurrency(EXTRA_GUEST_FEE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} x {extraGuests} x {nights} nights</span>
                          </div>
                          <div className="flex justify-between items-center mb-1 text-orange-600 text-xs sm:text-sm">
                            <span className="font-semibold">Extra guest fee:</span>
                            <span className="font-bold">{formatCurrency(extraGuestFee, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        </>
                      )}
                      {couponDiscount > 0 && activeCouponId && (
                        <div className="flex justify-between items-center mb-1 text-green-700 text-xs sm:text-sm">
                          <span>
                            Coupon ({activeCoupon?.discountPercent || 0}% OFF):
                          </span>
                          <span className="font-bold">{formatCurrency(-couponDiscount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-2 border-t border-blue-200">
                        <span className="text-sm sm:text-md font-semibold text-gray-700">
                          {couponDiscount > 0 ? 'Final Total:' : 'Total Amount:'}
                        </span>
                        <span className="text-xl sm:text-2xl font-bold text-amber-500">{formatCurrency(totalPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Personal Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                Name *
              </label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                placeholder="Juan"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                Surname *
              </label>
              <input
                type="text"
                name="surname"
                required
                value={formData.surname}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                placeholder="Cruz"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                Phone
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                placeholder=""
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                Mobile *
              </label>
              <input
                type="tel"
                name="mobile"
                required
                value={formData.mobile}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                placeholder="09123456789"
              />
            </div>
          </div>

          {/* Address Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                Region *
              </label>
              <select
                name="region"
                required
                value={formData.region}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                disabled={loading || formData.country !== "Philippines"}
              >
                <option value="">Select Region</option>
                {regions.map((region) => (
                  <option key={region.code} value={region.name}>
                    {region.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                Province *
              </label>
              <select
                name="province"
                required
                value={formData.province}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                disabled={loading || !formData.region}
              >
                <option value="">Select Province</option>
                {provinces.map((province) => (
                  <option key={province.code} value={province.name}>
                    {province.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                City/Municipality *
              </label>
              <select
                name="city"
                required
                value={formData.city}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                disabled={loading || !formData.province}
              >
                <option value="">Select City/Municipality</option>
                {cities.map((city) => (
                  <option key={city.code} value={city.name}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                Barangay *
              </label>
              <select
                name="barangay"
                required
                value={formData.barangay}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                disabled={loading || !formData.city}
              >
                <option value="">Select Barangay</option>
                {barangays.map((barangay) => (
                  <option key={barangay.code} value={barangay.name}>
                    {barangay.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                Street/Building *
              </label>
              <input
                type="text"
                name="street"
                required
                value={formData.street}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                placeholder="House No., Street Name"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                ZIP Code *
              </label>
              <input
                type="text"
                name="zip"
                required
                value={formData.zip}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                placeholder="8307"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
              Country *
            </label>
            <select
              name="country"
              required
              value={formData.country}
              onChange={handleChange}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            >
              <option value="Philippines">Philippines</option>
              <option value="United States">United States</option>
              <option value="Japan">Japan</option>
              <option value="South Korea">South Korea</option>
              <option value="China">China</option>
            </select>
            {formData.country === "Philippines" && (
              <p className="text-xs text-gray-500 mt-1">Address dropdowns will auto-populate for Philippines</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                Email *
              </label>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                placeholder="juan.delacruz@gmail.com"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                Fax <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                name="fax"
                value={formData.fax}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                placeholder=""
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                Job Title <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                name="jobTitle"
                value={formData.jobTitle}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                placeholder=""
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                Company <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                name="company"
                value={formData.company}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                placeholder=""
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
              Select Dates (check-in to check-out)
            </label>
            <div className="rounded-lg sm:rounded-xl border border-gray-200 p-2 sm:p-3 bg-white overflow-x-auto">
              <DayPicker
                mode="range"
                selected={range}
                onSelect={setRange}
                disabled={[{ before: new Date() }, ...disabledRanges()]}
                numberOfMonths={1}
                showOutsideDays
                weekStartsOn={1}
                captionLayout="dropdown"
              />
              <p className="text-xs text-gray-500 mt-2">
                Checkout day is available for new check-ins.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">Check-in Time</label>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <MobileTimePicker
                  value={checkInTime}
                  onChange={(newValue) => setCheckInTime(newValue)}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      size: "small",
                      className: "w-full"
                    }
                  }}
                />
              </LocalizationProvider>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">Check-out Time</label>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <MobileTimePicker
                  value={checkOutTime}
                  onChange={(newValue) => setCheckOutTime(newValue)}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      size: "small",
                      className: "w-full"
                    }
                  }}
                />
              </LocalizationProvider>
            </div>
          </div>

          {maintenanceConflict && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
              {maintenanceConflict}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                Room Type *
              </label>
              <select
                name="room"
                required
                value={formData.room}
                onChange={handleChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              >
                <option value="">Select a room</option>
                {roomsLoading ? (
                  <option value="" disabled>Loading rooms...</option>
                ) : rooms.length === 0 ? (
                  <option value="" disabled>No rooms available</option>
                ) : (
                  rooms.map((room) => (
                    <option key={room.id || room.name} value={room.name}>
                      {room.name} - {formatCurrency(room.price, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}{room.perBed ? room.perBed : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                Number of Guests *
              </label>
              <select
                name="guests"
                required
                value={formData.guests}
                onChange={handleChange}
                disabled={!selectedRoomData}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {!selectedRoomData ? (
                  <option value="">Select a room first</option>
                ) : (
                  Array.from({ length: selectedRoomData.perBed ? Math.min(selectedRoomData.maxGuests, 6) : selectedRoomData.maxGuests }, (_, i) => i + 1).map((num) => (
                    <option key={num} value={num.toString()}>
                      {num} {num === 1 ? 'Guest' : 'Guests'}
                    </option>
                  )).concat(
                    selectedRoomData.perBed
                      ? []
                      : (selectedRoomData.maxGuests < 10 ? (
                          <option key="more" value={(selectedRoomData.maxGuests + 1).toString()}>
                            {selectedRoomData.maxGuests + 1}+ Guests (Extra fee applies)
                          </option>
                        ) : [])
                  )
                )}
              </select>
              {selectedRoomData?.perBed && (
                <p className="mt-1 text-xs text-gray-500">Dorm rooms support up to 6 guests. Larger groups are not available.</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
              Coupon <span className="text-gray-400 font-normal">(Optional)</span>
            </label>
            <select
              name="couponId"
              value={formData.couponId}
              onChange={handleChange}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            >
              <option value="">No coupon</option>
              {coupons.map((coupon) => {
                const availability = availabilityMap[coupon.id] || getCouponAvailability(coupon);
                return (
                  <option key={coupon.id} value={coupon.id} disabled={!availability.active}>
                    {coupon.title} - {coupon.discountPercent}% OFF{availability.active ? '' : ' (Unavailable now)'}
                  </option>
                );
              })}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              One coupon only per guest identity (name/contact/address), one-time use.
            </p>
            {activeCouponId && checkingCouponIdentity && (
              <p className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                Checking if this guest can still use a coupon...
              </p>
            )}
            {activeCouponId && couponIdentityConflict && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <p className="font-semibold">Coupon cannot be applied</p>
                <p>{couponIdentityConflict} Select “No coupon” to continue.</p>
              </div>
            )}
            {activeCouponId && !activeCouponAvailability?.active && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {activeCouponAvailability?.reason || 'Coupon cannot be used right now.'} Today in Asia/Manila: {getCouponNowLabel()}.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
              Special Requests
            </label>
            <textarea
              name="message"
              value={formData.message}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all resize-none"
              placeholder="Any special requests or requirements..."
            />
          </div>

          {/* Booking Confirmation Notice */}
          <div className="bg-linear-to-r from-amber-50 to-yellow-50 rounded-lg sm:rounded-xl p-3 sm:p-4 border-2 border-amber-300">
            <div className="flex items-start gap-2 sm:gap-3">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="font-bold text-amber-900 mb-1 text-xs sm:text-sm">Booking Confirmation Required</h4>
                <p className="text-xs sm:text-sm text-amber-800">
                  Your booking will be submitted as <span className="font-semibold">pending</span> and requires staff confirmation.
                  Once confirmed by our staff, you will be notified via email and your room will be officially reserved and blocked for your dates.
                </p>
              </div>
            </div>
          </div>

          {/* Booking Summary */}
          {nights > 0 && selectedRoomData && (
            <div className="bg-linear-to-r from-blue-50 to-indigo-50 rounded-lg sm:rounded-xl p-4 sm:p-5 border-2 border-blue-200">
              <h3 className="text-sm sm:text-lg font-bold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Booking Summary
              </h3>
              <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between items-center py-2 border-b border-blue-200">
                  <span className="text-gray-700 font-medium">Room:</span>
                  <span className="text-blue-900 font-bold">{formData.room}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-blue-200">
                  <span className="text-gray-700 font-medium">Number of nights:</span>
                  <span className="text-blue-900 font-bold">{nights} {nights === 1 ? 'night' : 'nights'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-blue-200">
                  <span className="text-gray-700 font-medium">Number of guests:</span>
                  <span className="text-blue-900 font-bold">{formData.guests}</span>
                </div>

                {/* Room Rate Information */}
                <div className="py-2 border-t border-b border-blue-300 bg-blue-50 px-2 rounded">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-gray-700 font-medium">Rate per night:</span>
                    <span className="text-blue-900 font-semibold">{formatCurrency(selectedRoomData.price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {selectedRoomData?.perBed ? (
                    <div className="text-xs text-gray-600 italic flex justify-between items-center">
                      <span>(per bed x {formData.guests} guests x {nights} nights)</span>
                      <span className="text-blue-900 font-semibold">{formatCurrency(selectedRoomData.price * parseInt(formData.guests) * nights, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600 italic flex justify-between items-center">
                      <span>({formatCurrency(selectedRoomData.price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} x {nights} {nights === 1 ? 'night' : 'nights'})</span>
                      <span className="text-blue-900 font-semibold">{formatCurrency(selectedRoomData.price * nights, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>

                {/* Extra Guests Fee */}
                {extraGuests > 0 && !selectedRoomData?.perBed && (
                  <>
                    <div className="flex justify-between items-center py-2 border-b border-orange-200 bg-orange-50 px-3 rounded">
                      <span className="text-orange-700 font-medium">Extra guests ({extraGuests}):</span>
                      <span className="text-orange-800 font-semibold">{formatCurrency(EXTRA_GUEST_FEE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} x {extraGuests} x {nights}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-orange-200 bg-orange-50 px-3 rounded">
                      <span className="text-orange-700 font-medium">Extra guest fee:</span>
                      <span className="text-orange-800 font-bold">{formatCurrency(extraGuestFee, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}

                {couponDiscount > 0 && activeCouponId && (
                  <div className="flex justify-between items-center py-2 border-b border-green-200 bg-green-50 px-3 rounded">
                    <span className="text-green-700 font-medium">
                      Coupon ({activeCoupon?.discountPercent || 0}% OFF):
                    </span>
                    <span className="text-green-800 font-bold">{formatCurrency(-couponDiscount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}

                {/* Total */}
                <div className="flex justify-between items-center py-2 sm:py-3 mt-2 bg-amber-100 rounded-lg px-3">
                  <span className="text-gray-800 font-bold text-sm sm:text-base">
                    {couponDiscount > 0 ? 'Final Total:' : 'Total Amount:'}
                  </span>
                  <span className="text-lg sm:text-2xl font-bold text-amber-600">{formatCurrency(totalPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={
              !!maintenanceConflict ||
              loading ||
              !range?.from ||
              !range?.to ||
              (activeCouponId ? !activeCouponAvailability?.active || Boolean(couponIdentityConflict) || checkingCouponIdentity : false)
            }
            className={`btn-book-now w-full justify-center text-sm sm:text-base md:text-lg ${maintenanceConflict ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            BOOK NOW
          </button>
        </form>
      </div>
    </div>
  );
}
