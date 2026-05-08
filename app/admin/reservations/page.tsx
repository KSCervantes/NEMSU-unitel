"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Swal from 'sweetalert2';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminMainContent from '../components/AdminMainContent';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import { auth, db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, getDocs, getDoc, where, writeBatch } from 'firebase/firestore';
import { sanitizeHtml, sanitizeText } from '@/lib/sanitize';
import { logError, logInfo } from '@/lib/logger';
import { getEnhancedErrorMessage } from '@/lib/errorMessages';
import { } from '@/app/components/EmptyState';
import { } from '@/app/hooks/useFocusTrap';
import { useKeyboardNavigation } from '@/app/hooks/useKeyboardNavigation';
import { initCSRF, getCSRFToken } from '@/lib/csrf';
import ModalWithFocusTrap from '@/app/components/ModalWithFocusTrap';
import { DayPicker } from 'react-day-picker';
import type { DateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { Room } from '@/lib/types/room';
import { calculateBookingPayment } from '@/lib/bookingPricing';
import { useCoupons } from '@/app/hooks/useCoupons';
import { useAdminCurrency } from '../hooks/useAdminCurrency';
import { useHotelSettings } from '@/app/hooks/useHotelSettings';
import {
  CouponId,
  type CouponIdentityLock,
  getCouponAvailability,
  getCouponIdentityLocks,
  getCouponNowLabel,
  getCouponUsageDocId,
  isCouponId,
  normalizeGuestEmail
} from '@/lib/coupons';

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

interface Booking {
  id: string;
  name: string;
  surname: string;
  email: string;
  mobile: string;
  phone?: string;
  room: string;
  checkIn: string;
  checkOut: string;
  guests: string;
  status: 'pending' | 'confirmed' | 'in-progress' | 'cancelled' | 'completed';
  createdAt: any;
  street?: string;
  street1?: string;
  region?: string;
  province?: string;
  city?: string;
  barangay?: string;
  zip?: string;
  country?: string;
  fax?: string;
  jobTitle?: string;
  company?: string;
  message?: string;
  emailLower?: string;
  coupon?: {
    applied: boolean;
    id?: CouponId;
    title?: string;
    discountPercent?: number;
    discountAmount?: number;
    availabilityText?: string;
  };
  payment?: {
    nights: number;
    guests: number;
    basePrice: number;
    extraFee: number;
    subtotal?: number;
    couponDiscount?: number;
    total: number;
  };
}

type ReservationFilter = 'all' | 'pending' | 'confirmed' | 'in-progress' | 'cancelled' | 'completed';

const reservationFilters: ReservationFilter[] = ['all', 'pending', 'confirmed', 'in-progress', 'cancelled', 'completed'];

const formatStatusLabel = (status: string) =>
  status
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

function ReservationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useProtectedAdminPage();
  const { formatCurrency } = useAdminCurrency(isAuthenticated);
  const { settings: hotelSettings } = useHotelSettings(isAuthenticated);

  // Enable keyboard navigation
  useKeyboardNavigation();

  // Initialize CSRF token
  useEffect(() => {
    if (typeof window !== 'undefined') {
      initCSRF();
    }
  }, []);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookedByRoom, setBookedByRoom] = useState<Record<string, { start: number; end: number; id: string }[]>>({});
  const [maintenanceByRoom, setMaintenanceByRoom] = useState<Record<string, { start: number; end: number; id: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewDetailsOpen, setIsViewDetailsOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [viewDetailsBooking, setViewDetailsBooking] = useState<Booking | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<CouponId | "">("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [conflictStatus, setConflictStatus] = useState<{ hasConflict: boolean; type: 'booking' | 'maintenance' | null; message: string }>({ hasConflict: false, type: null, message: '' });
  const [range, setRange] = useState<DateRange | undefined>();
  const [regions, setRegions] = useState<Region[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const { coupons, couponMap, availabilityMap } = useCoupons(isAuthenticated);
  const statusParam = searchParams.get('status') as ReservationFilter | null;
  const filter: ReservationFilter = statusParam && reservationFilters.includes(statusParam) ? statusParam : 'all';
  const [formData, setFormData] = useState<Partial<Booking>>({
    name: '',
    surname: '',
    email: '',
    mobile: '',
    phone: '',
    room: '',
    checkIn: '',
    checkOut: '',
    guests: '1',
    status: 'pending',
    street: '',
    street1: '',
    region: '',
    province: '',
    city: '',
    barangay: '',
    zip: '',
    country: 'Philippines',
    fax: '',
    jobTitle: '',
    company: '',
    message: ''
  });

  // Fetch regions on modal open
  useEffect(() => {
    if (isModalOpen && formData.country === "Philippines") {
      fetchRegions();
    }
  }, [isModalOpen, formData.country]);

  const fetchRegions = async () => {
    try {
      setAddressLoading(true);
      const response = await fetch("https://psgc.cloud/api/regions");
      const data = await response.json();
      setRegions(data);
    } catch (error) {
      logError("Error fetching regions:", error);
    } finally {
      setAddressLoading(false);
    }
  };

  const fetchProvinces = async (regionCode: string) => {
    try {
      setAddressLoading(true);
      const response = await fetch(`https://psgc.cloud/api/regions/${regionCode}/provinces`);
      const data = await response.json();
      setProvinces(data);
      setCities([]);
      setBarangays([]);
    } catch (error) {
      logError("Error fetching provinces:", error);
    } finally {
      setAddressLoading(false);
    }
  };

  const fetchCities = async (provinceCode: string) => {
    try {
      setAddressLoading(true);
      const response = await fetch(`https://psgc.cloud/api/provinces/${provinceCode}/cities-municipalities`);
      const data = await response.json();
      setCities(data);
      setBarangays([]);
    } catch (error) {
      logError("Error fetching cities:", error);
    } finally {
      setAddressLoading(false);
    }
  };

  const fetchBarangays = async (cityCode: string) => {
    try {
      setAddressLoading(true);
      const response = await fetch(`https://psgc.cloud/api/cities-municipalities/${cityCode}/barangays`);
      const data = await response.json();
      setBarangays(data);
    } catch (error) {
      logError("Error fetching barangays:", error);
    } finally {
      setAddressLoading(false);
    }
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    // Handle cascading dropdowns
    if (name === "region") {
      const selectedRegion = regions.find(r => r.name === value);
      if (selectedRegion) {
        fetchProvinces(selectedRegion.code);
        setFormData({ ...formData, region: value, province: '', city: '', barangay: '' });
      }
    } else if (name === "province") {
      const selectedProvince = provinces.find(p => p.name === value);
      if (selectedProvince) {
        fetchCities(selectedProvince.code);
        setFormData({ ...formData, province: value, city: '', barangay: '' });
      }
    } else if (name === "city") {
      const selectedCity = cities.find(c => c.name === value);
      if (selectedCity) {
        fetchBarangays(selectedCity.code);
        setFormData({ ...formData, city: value, barangay: '' });
      }
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (expandedBooking && !(event.target as Element).closest('.relative')) {
        setExpandedBooking(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expandedBooking]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookingsData: Booking[] = [];
      const rangeMap: Record<string, { start: number; end: number; id: string }[]> = {};

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const booking: Booking = {
          id: docSnap.id,
          ...data
        } as Booking;
        bookingsData.push(booking);

        // Only confirmed and in-progress bookings block room availability.
        if ((booking.status === 'confirmed' || booking.status === 'in-progress') && booking.room && booking.checkIn && booking.checkOut) {
          const start = new Date(booking.checkIn).setHours(0, 0, 0, 0);
          const end = new Date(booking.checkOut).setHours(0, 0, 0, 0); // checkout is exclusive
          if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            if (!rangeMap[booking.room]) rangeMap[booking.room] = [];
            rangeMap[booking.room].push({ start, end, id: booking.id });
          }
        }
      });

      setBookings(bookingsData);
      setBookedByRoom(rangeMap);
      setLoading(false);
    });

    // Maintenance listener for blocking dates
    const maintenanceQuery = query(collection(db, 'maintenance'), where('status', 'in', ['pending', 'in-progress']));
    const unsubscribeMaintenance = onSnapshot(maintenanceQuery, (snap) => {
      const map: Record<string, { start: number; end: number; id: string }[]> = {};
      snap.forEach((docSnap) => {
        const d = docSnap.data() as any;
        if (!d?.room) return;

        let start: number;
        let end: number;

        if (d.startDate && d.dueDate) {
          start = new Date(d.startDate).setHours(0, 0, 0, 0);
          end = new Date(d.dueDate).setHours(23, 59, 59, 999);
        } else if (d.start && d.end) {
          start = new Date(d.start).getTime();
          end = new Date(d.end).getTime();
        } else if (d.dueDate) {
          const dueDate = new Date(d.dueDate);
          start = new Date(dueDate).setHours(0, 0, 0, 0);
          end = new Date(dueDate).setHours(23, 59, 59, 999);
        } else {
          start = new Date().setHours(0, 0, 0, 0);
          end = new Date().setHours(23, 59, 59, 999);
        }

        if (!Number.isFinite(start) || !Number.isFinite(end)) return;
        if (!map[d.room]) map[d.room] = [];
        map[d.room].push({ start, end, id: docSnap.id });
      });
      setMaintenanceByRoom(map);
    });

    return () => {
      unsubscribe();
      unsubscribeMaintenance();
    };
  }, [isAuthenticated]);

  // Auto-complete bookings that have passed checkout date
  useEffect(() => {
    if (!isAuthenticated || bookings.length === 0) return;

    const autoCompleteExpiredBookings = async () => {
      try {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const today = now.getTime();

        // Find confirmed bookings where checkout date has passed
        const expiredBookings = bookings.filter(booking => {
          if ((booking.status !== 'confirmed' && booking.status !== 'in-progress') || !booking.checkOut) return false;
          const checkoutDate = new Date(booking.checkOut);
          checkoutDate.setHours(0, 0, 0, 0);
          const checkoutTime = checkoutDate.getTime();
          // Checkout is exclusive, so mark as completed if today > checkout date
          return today > checkoutTime;
        });

        if (expiredBookings.length === 0) return;

        // Batch update expired bookings to completed status
        const batch = writeBatch(db);
        expiredBookings.forEach(booking => {
          const bookingRef = doc(db, 'bookings', booking.id);
          batch.update(bookingRef, {
            status: 'completed',
            completedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        });

        await batch.commit();
        logInfo(`Auto-completed ${expiredBookings.length} expired booking(s)`);
        
        // Show a subtle notification (optional - can be removed if too noisy)
        if (expiredBookings.length > 0) {
          Swal.fire({
            icon: 'success',
            title: 'Bookings Auto-Completed',
            text: `${expiredBookings.length} booking(s) automatically marked as completed`,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
          });
        }
      } catch (error) {
        logError('Error auto-completing expired bookings:', error);
      }
    };

    // Check immediately on first load, then periodically every 5 minutes
    autoCompleteExpiredBookings();
    const intervalId = setInterval(() => {
      autoCompleteExpiredBookings();
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(intervalId);
  }, [isAuthenticated, bookings]);

  // Fetch available rooms
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const q = query(collection(db, 'rooms'));
        const snapshot = await getDocs(q);
        const roomsData: Room[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Room, 'id'>)
        }));
        const uniqueRooms = Array.from(new Map(roomsData.map((room) => [room.name, room])).values());
        setRooms(uniqueRooms.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (error) {
        logError('Error fetching rooms:', error);
      }
    };
    fetchRooms();
  }, []);

  // Build disabled day intervals for the selected room
  const disabledRanges = () => {
    const r = bookedByRoom[formData.room || ''] || [];
    const m = maintenanceByRoom[formData.room || ''] || [];
    const toIntervals = (list: { start: number; end: number; id: string }[]) => list
      .filter(iv => iv.id !== editingBooking?.id) // Exclude current booking when editing
      .map((iv) => {
        const from = new Date(iv.start);
        from.setHours(0, 0, 0, 0);
        const to = new Date(iv.end);
        // make checkout day available again: disable until the day before checkout
        const last = new Date(to);
        last.setDate(last.getDate() - 1);
        last.setHours(23, 59, 59, 999);
        return { from, to: last };
      });
    return [...toIntervals(r), ...toIntervals(m)];
  };

  // Sync range with formData (range is the single source of truth while the modal is open)
  useEffect(() => {
    if (!isModalOpen) return;
    if (range?.from && range?.to) {
      const checkIn = range.from.toISOString().split('T')[0];
      const checkOut = range.to.toISOString().split('T')[0];
      setFormData(prev => {
        if (prev.checkIn === checkIn && prev.checkOut === checkOut) {
          return prev;
        }
        return { ...prev, checkIn, checkOut };
      });
    } else if (!range) {
      setFormData(prev => {
        if (!prev.checkIn && !prev.checkOut) {
          return prev;
        }
        return { ...prev, checkIn: '', checkOut: '' };
      });
    }
  }, [range, isModalOpen]);

  // When opening the modal for editing, initialize range from the existing booking once
  useEffect(() => {
    if (!isModalOpen || !editingBooking) return;
    if (editingBooking.checkIn && editingBooking.checkOut) {
      const from = new Date(editingBooking.checkIn);
      const to = new Date(editingBooking.checkOut);
      setRange({ from, to });
    } else {
      setRange(undefined);
    }
  }, [isModalOpen, editingBooking]);

  // Real-time conflict detection for form
  const checkFormConflicts = useCallback((room: string, checkInStr: string, checkOutStr: string) => {
    if (!room || !checkInStr || !checkOutStr) {
      setConflictStatus({ hasConflict: false, type: null, message: '' });
      return;
    }

    const checkIn = new Date(checkInStr).setHours(0, 0, 0, 0);
    const checkOut = new Date(checkOutStr).setHours(0, 0, 0, 0);

    if (!Number.isFinite(checkIn) || !Number.isFinite(checkOut) || checkOut <= checkIn) {
      setConflictStatus({ hasConflict: false, type: null, message: '' });
      return;
    }

    // Check booking conflicts
    const existing = bookedByRoom[room] || [];
    const conflictingBooking = existing.find(r => r.id !== editingBooking?.id && checkIn < r.end && checkOut > r.start);
    if (conflictingBooking) {
      const conflictStart = new Date(conflictingBooking.start).toLocaleDateString();
      const conflictEnd = new Date(conflictingBooking.end).toLocaleDateString();
      setConflictStatus({
        hasConflict: true,
        type: 'booking',
        message: `⚠️ Overlaps with existing booking (${conflictStart} - ${conflictEnd})`
      });
      return;
    }

    // Check maintenance conflicts
    const maintenance = maintenanceByRoom[room] || [];
    const conflictingMaintenance = maintenance.find(r => checkIn < r.end && checkOut > r.start);
    if (conflictingMaintenance) {
      const maintStart = new Date(conflictingMaintenance.start).toLocaleDateString();
      const maintEnd = new Date(conflictingMaintenance.end).toLocaleDateString();
      setConflictStatus({
        hasConflict: true,
        type: 'maintenance',
        message: `🔧 Room is under maintenance (${maintStart} - ${maintEnd})`
      });
      return;
    }

    // No conflicts
    setConflictStatus({
      hasConflict: false,
      type: null,
      message: '✅ Dates are available for this room'
    });
  }, [bookedByRoom, maintenanceByRoom, editingBooking?.id]);

  // Trigger conflict check whenever form data changes
  useEffect(() => {
    checkFormConflicts(formData.room || '', formData.checkIn || '', formData.checkOut || '');
  }, [formData.room, formData.checkIn, formData.checkOut, editingBooking?.id, checkFormConflicts]);

  const getRoomPricingData = useCallback((roomName: string) => {
    const room = rooms.find((item) => item.name === roomName);
    if (!room) return null;

    return {
      price: room.priceNumber || parseFloat(String(room.price || '0').replace(/,/g, '')) || 0,
      maxGuests: room.maxGuests || 1,
      perBed: room.perBed,
    };
  }, [rooms]);

  useEffect(() => {
    if (selectedCouponId && !couponMap[selectedCouponId]) {
      setSelectedCouponId("");
    }
  }, [couponMap, selectedCouponId]);

  const selectedAdminCouponAvailability = selectedCouponId
    ? (availabilityMap[selectedCouponId] || getCouponAvailability(couponMap[selectedCouponId] || null))
    : null;
  const isLockedCouponSelection = Boolean(editingBooking?.coupon?.applied && editingBooking.coupon.id);
  const isIdentityFieldsLocked = Boolean(editingBooking?.coupon?.applied);
  const isBookingCoreFieldsLocked = Boolean(editingBooking?.coupon?.applied);

  const getPaymentWithoutCoupon = (booking: Booking) => {
    if (!booking.payment) return undefined;
    const subtotal = Number(booking.payment.subtotal ?? ((booking.payment.basePrice || 0) + (booking.payment.extraFee || 0))) || 0;
    const previousDiscount = Number(booking.payment.couponDiscount ?? booking.coupon?.discountAmount ?? 0) || 0;
    const fallbackTotal = (Number(booking.payment.total) || 0) + previousDiscount;

    return {
      ...booking.payment,
      couponDiscount: 0,
      total: subtotal > 0 ? subtotal : fallbackTotal,
    };
  };

  const askToConfirmWithoutCoupon = async (booking: Booking, conflictSource: string) => {
    const paymentWithoutCoupon = getPaymentWithoutCoupon(booking);
    const originalTotal = Number(booking.payment?.total ?? 0) || 0;
    const updatedTotal = Number(paymentWithoutCoupon?.total ?? originalTotal) || 0;
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Coupon Already Used',
      html: `
        <div class="text-left">
          <p>This guest already redeemed a coupon through the same ${conflictSource}.</p>
          <p class="mt-2">You can still confirm the reservation, but the coupon discount will be removed and the booking total will be recalculated.</p>
          <p class="mt-3 text-sm"><strong>Current total:</strong> ${formatCurrency(originalTotal, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p class="text-sm"><strong>Total without coupon:</strong> ${formatCurrency(updatedTotal, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Confirm without coupon',
      cancelButtonText: 'Keep pending',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#6b7280',
    });

    return {
      confirmed: result.isConfirmed,
      paymentWithoutCoupon,
    };
  };

  const updateBookingStatus = async (bookingId: string, newStatus: 'pending' | 'confirmed' | 'in-progress' | 'cancelled' | 'completed') => {
    try {
      const booking = bookings.find(b => b.id === bookingId);
      const bookingRef = doc(db, 'bookings', bookingId);
      let notificationBooking = booking;
      const statusPayload = {
        status: newStatus,
        updatedAt: serverTimestamp(),
        ...(newStatus === 'completed' && { completedAt: serverTimestamp() })
      };

      if (booking && newStatus === 'confirmed' && booking.coupon?.applied && booking.coupon.id) {
        const couponId = booking.coupon.id;
        const normalizedEmail = normalizeGuestEmail(booking.email || '');
        const couponUsageDocId = getCouponUsageDocId(normalizedEmail);
        const couponUsageRef = couponUsageDocId ? doc(db, 'couponUsages', couponUsageDocId) : null;
        const couponIdentityLocks = getCouponIdentityLocks({
          name: String(booking.name || ''),
          surname: String(booking.surname || ''),
          email: String(booking.email || ''),
          mobile: String(booking.mobile || ''),
          phone: String(booking.phone || ''),
          street: String(booking.street || ''),
          street1: String(booking.street1 || ''),
          region: String(booking.region || ''),
          province: String(booking.province || ''),
          city: String(booking.city || ''),
          barangay: String(booking.barangay || ''),
          zip: String(booking.zip || ''),
          country: String(booking.country || ''),
        });

        let couponConflictSource: string | null = null;
        let shouldCreateUsageLock = false;
        if (couponUsageRef) {
          const usageSnapshot = await getDoc(couponUsageRef);
          if (!usageSnapshot.exists()) {
            shouldCreateUsageLock = true;
          } else {
            const usageData = usageSnapshot.data() as { bookingId?: string; couponId?: string };
            const usageMatchesCurrentBooking =
              usageData.bookingId === bookingId &&
              usageData.couponId === couponId;
            if (!usageMatchesCurrentBooking) {
              couponConflictSource = 'email';
            }
          }
        }

        const identityLocksToCreate: CouponIdentityLock[] = [];
        if (!couponConflictSource) {
          for (const identityLock of couponIdentityLocks) {
            const identityRef = doc(db, 'couponIdentityLocks', identityLock.identityKey);
            const identitySnapshot = await getDoc(identityRef);
            if (!identitySnapshot.exists()) {
              identityLocksToCreate.push(identityLock);
              continue;
            }

            const identityData = identitySnapshot.data() as { bookingId?: string; couponId?: string };
            const identityMatchesCurrentBooking =
              identityData.bookingId === bookingId &&
              identityData.couponId === couponId;
            if (!identityMatchesCurrentBooking) {
              couponConflictSource = identityLock.identityType;
              break;
            }
          }
        }

        if (couponConflictSource) {
          const confirmWithoutCoupon = await askToConfirmWithoutCoupon(booking, couponConflictSource);
          if (!confirmWithoutCoupon.confirmed) {
            return;
          }

          await updateDoc(bookingRef, {
            ...statusPayload,
            couponId: '',
            coupon: {
              applied: false,
              removedReason: 'Coupon already used by this guest identity',
            },
            ...(confirmWithoutCoupon.paymentWithoutCoupon && { payment: confirmWithoutCoupon.paymentWithoutCoupon }),
          });
          notificationBooking = {
            ...booking,
            status: newStatus,
            coupon: { applied: false },
            ...(confirmWithoutCoupon.paymentWithoutCoupon && { payment: confirmWithoutCoupon.paymentWithoutCoupon }),
          };
        } else {
          const batch = writeBatch(db);
          batch.update(bookingRef, statusPayload);

          if (couponUsageRef && couponUsageDocId && shouldCreateUsageLock) {
            batch.set(couponUsageRef, {
              emailKey: couponUsageDocId,
              emailLower: normalizedEmail,
              couponId,
              bookingId,
              source: 'admin',
              createdAt: serverTimestamp(),
            });
          }

          identityLocksToCreate.forEach((identityLock) => {
            const identityRef = doc(db, 'couponIdentityLocks', identityLock.identityKey);
            batch.set(identityRef, {
              identityKey: identityLock.identityKey,
              identityType: identityLock.identityType,
              couponId,
              bookingId,
              source: 'admin',
              createdAt: serverTimestamp(),
            });
          });

          await batch.commit();
        }
      } else {
        await updateDoc(bookingRef, statusPayload);
      }

      // Send email notification if booking found and status is confirmed or cancelled
      let emailSent = false;
      if (notificationBooking && (newStatus === 'confirmed' || newStatus === 'cancelled')) {
        try {
          const currentUser = auth.currentUser;
          const idToken = currentUser ? await currentUser.getIdToken() : null;
          const adminEmail = (currentUser?.email || sessionStorage.getItem('adminEmail') || '').trim().toLowerCase();
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (idToken && adminEmail) {
            headers.authorization = `Bearer ${idToken}`;
            headers['x-admin-email'] = adminEmail;
          }

          const response = await fetch('/api/send-email', {
            method: 'POST',
              headers,
              body: JSON.stringify({
              to: notificationBooking.email,
              type: newStatus === 'confirmed' ? 'approved' : 'rejected',
              bookingId,
              guestName: `${notificationBooking.name} ${notificationBooking.surname}`,
              roomType: notificationBooking.room,
              checkIn: new Date(notificationBooking.checkIn).toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
              }),
              checkOut: new Date(notificationBooking.checkOut).toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
              }),
              guests: Number.parseInt(String(notificationBooking.guests || '1'), 10) || 1,
              totalAmount: Number(notificationBooking.payment?.total ?? 0) || undefined,
              reason: newStatus === 'cancelled' ? 'Room not available for selected dates' : undefined,
              hotelName: hotelSettings.hotelName,
              contactEmail: hotelSettings.contactEmail,
              contactPhone: hotelSettings.contactPhone,
              checkInTime: hotelSettings.checkInTime,
              checkOutTime: hotelSettings.checkOutTime,
              currency: hotelSettings.currency,
            })
          });

          if (!response.ok) {
            logError(`Failed to send email notification: ${response.status}`);
          } else {
            emailSent = true;
          }
        } catch (emailError) {
          logError('Failed to send email notification:', emailError);
          // Don't block the status update if email fails
        }
      }

      const statusText = formatStatusLabel(newStatus);
      Swal.fire({
        icon: 'success',
        title: 'Status Updated!',
        text: emailSent
          ? `Booking status changed to ${statusText}. Email notification sent to guest.`
          : `Booking status changed to ${statusText}.`,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } catch (error) {
      logError('Error updating booking status:', error);
      const errorDetails = getEnhancedErrorMessage(error);
      Swal.fire({
        icon: 'error',
        title: errorDetails.title,
        html: `<p>${errorDetails.message}</p>${errorDetails.action ? `<p class="mt-2 text-sm text-gray-600">${errorDetails.action}</p>` : ''}`,
        confirmButtonColor: '#3b82f6'
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
      case 'in-progress':
        return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400';
      case 'pending':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
      case 'cancelled':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
      case 'completed':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
    }
  };

  const deleteBooking = async (bookingId: string) => {
    const result = await Swal.fire({
      title: 'Delete Reservation?',
      text: 'This action cannot be undone',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, delete it',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    try {
      await Swal.fire({
        title: 'Deleting...',
        didOpen: async () => {
          Swal.showLoading();
          await deleteDoc(doc(db, 'bookings', bookingId));
          Swal.hideLoading();
        },
        willClose: () => {}
      });
      Swal.fire({
        icon: 'success',
        title: 'Deleted!',
        text: 'Reservation has been deleted successfully',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } catch (error) {
      logError('Error deleting booking:', error);
      const errorDetails = getEnhancedErrorMessage(error);
      Swal.fire({
        icon: 'error',
        title: errorDetails.title,
        html: `<p>${errorDetails.message}</p>${errorDetails.action ? `<p class="mt-2 text-sm text-gray-600">${errorDetails.action}</p>` : ''}`,
        confirmButtonColor: '#3b82f6'
      });
    }
  };

  const printBooking = (booking: Booking) => {
    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) return;

    // Sanitize all user input to prevent XSS
    const safeName = sanitizeText(booking.name);
    const safeSurname = sanitizeText(booking.surname);
    const safeEmail = sanitizeText(booking.email);
    const safeMobile = sanitizeText(booking.mobile);
    const safePhone = booking.phone ? sanitizeText(booking.phone) : '';
    const safeRoom = sanitizeText(booking.room);
    const safeStreet = booking.street ? sanitizeText(booking.street) : '';
    const safeCity = booking.city ? sanitizeText(booking.city) : '';
    const safeProvince = booking.province ? sanitizeText(booking.province) : '';
    const safeMessage = booking.message ? sanitizeHtml(booking.message) : '';
    const safeHotelName = sanitizeText(hotelSettings.hotelName);
    const safeCouponTitle = booking.coupon?.title ? sanitizeText(booking.coupon.title) : '';
    const couponDiscountValue = Number(booking.payment?.couponDiscount ?? booking.coupon?.discountAmount ?? 0) || 0;
    const formattedBasePrice = formatCurrency(booking.payment?.basePrice ?? 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedExtraFee = formatCurrency(booking.payment?.extraFee ?? 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedSubtotal = formatCurrency(
      booking.payment?.subtotal ?? ((booking.payment?.basePrice || 0) + (booking.payment?.extraFee || 0)),
      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    );
    const formattedCouponDiscount = formatCurrency(-couponDiscountValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedTotal = formatCurrency(booking.payment?.total ?? 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    printWindow.document.write(`
      <html>
        <head>
          <title>Reservation - ${safeName} ${safeSurname}</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: 'Inter', Arial, sans-serif;
              background: #f8fafc;
              color: #1e293b;
              padding: 0;
              margin: 0;
            }
            .container {
              max-width: 700px;
              margin: 40px auto;
              background: #fff;
              border-radius: 16px;
              box-shadow: 0 4px 24px rgba(30, 64, 175, 0.08);
              padding: 32px 40px;
            }
            h1 {
              color: #2563eb;
              font-size: 2.2rem;
              font-weight: 700;
              margin-bottom: 12px;
              text-align: center;
            }
            .section {
              margin: 32px 0;
            }
            .section-title {
              font-size: 1.2rem;
              font-weight: 600;
              color: #334155;
              margin-bottom: 18px;
              border-bottom: 1px solid #e5e7eb;
              padding-bottom: 6px;
            }
            .info-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 12px;
            }
            .info-table td {
              padding: 8px 0;
              vertical-align: top;
            }
            .label {
              font-weight: 600;
              color: #64748b;
              width: 180px;
              display: inline-block;
            }
            .value {
              color: #1e293b;
              font-weight: 400;
              display: inline-block;
            }
            .payment-summary {
              background: #f1f5f9;
              border-radius: 10px;
              padding: 18px 24px;
              margin-top: 10px;
              margin-bottom: 10px;
            }
            .total {
              font-size: 1.3rem;
              font-weight: 700;
              color: #16a34a;
              margin-top: 10px;
            }
            .footer {
              text-align: center;
              color: #64748b;
              margin-top: 40px;
              font-size: 1rem;
            }
            .logo-container {
              text-align: center;
              margin-bottom: 24px;
              padding-bottom: 20px;
              border-bottom: 2px solid #e5e7eb;
            }
            .logo-container img {
              max-width: 120px;
              height: auto;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo-container">
              <img src="/img/NEMSU_LOGOO.webp" alt="${safeHotelName} Logo" />
            </div>
            <h1>${safeHotelName} Reservation</h1>
            <div class="section">
              <div class="section-title">Guest Information</div>
              <table class="info-table">
                <tr><td class="label">Name:</td><td class="value">${safeName} ${safeSurname}</td></tr>
                <tr><td class="label">Email:</td><td class="value">${safeEmail}</td></tr>
                <tr><td class="label">Mobile:</td><td class="value">${safeMobile}</td></tr>
                ${safePhone ? `<tr><td class="label">Phone:</td><td class="value">${safePhone}</td></tr>` : ''}
              </table>
            </div>
            <div class="section">
              <div class="section-title">Booking Details</div>
              <table class="info-table">
                <tr><td class="label">Room:</td><td class="value">${safeRoom}</td></tr>
                <tr><td class="label">Check-in:</td><td class="value">${new Date(booking.checkIn).toLocaleDateString()}</td></tr>
                <tr><td class="label">Check-out:</td><td class="value">${new Date(booking.checkOut).toLocaleDateString()}</td></tr>
                <tr><td class="label">Number of Nights:</td><td class="value">${Math.ceil((new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / (1000 * 60 * 60 * 24))} night(s)</td></tr>
                <tr><td class="label">Guests:</td><td class="value">${sanitizeText(booking.guests)}</td></tr>
                <tr><td class="label">Status:</td><td class="value">${sanitizeText(booking.status.toUpperCase())}</td></tr>
              </table>
            </div>
            <div class="section">
              <div class="section-title">Payment Details</div>
              <div class="payment-summary">
                ${booking.payment ? `
                <div><span class="label">Nights:</span> <span class="value">${booking.payment.nights}</span></div>
                <div><span class="label">Base Price:</span> <span class="value">${formattedBasePrice}</span></div>
                <div><span class="label">Extra Guest Fee:</span> <span class="value">${formattedExtraFee}</span></div>
                <div><span class="label">Subtotal:</span> <span class="value">${formattedSubtotal}</span></div>
                ${booking.coupon?.applied ? `
                <div><span class="label">Coupon:</span> <span class="value">${safeCouponTitle || sanitizeText(booking.coupon?.id || '')} (${booking.coupon?.discountPercent || 0}% OFF)</span></div>
                <div><span class="label">Coupon Discount:</span> <span class="value">${formattedCouponDiscount}</span></div>
                ` : ''}
                <div class="total"><span class="label">Total Payment:</span> ${formattedTotal}</div>
                ` : `
                <div><span class="label" style="color: #64748b;">Payment information not available</span></div>
                `}
              </div>
            </div>
            ${(safeStreet || safeCity) ? `
            <div class="section">
              <div class="section-title">Address</div>
              <table class="info-table">
                ${safeStreet ? `<tr><td class="label">Street:</td><td class="value">${safeStreet}</td></tr>` : ''}
                ${safeCity ? `<tr><td class="label">City:</td><td class="value">${safeCity}</td></tr>` : ''}
                ${safeProvince ? `<tr><td class="label">Province:</td><td class="value">${safeProvince}</td></tr>` : ''}
              </table>
            </div>` : ''}
            ${safeMessage ? `
            <div class="section">
              <div class="section-title">Special Requests</div>
              <div class="value">${safeMessage}</div>
            </div>` : ''}
            <div class="footer">Thank you for choosing ${safeHotelName}</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleOpenModal = (booking?: Booking) => {
    if (booking) {
      setEditingBooking(booking);
      setFormData(booking);
      setSelectedCouponId(booking.coupon?.applied && booking.coupon.id ? booking.coupon.id : "");
    } else {
      setEditingBooking(null);
      setSelectedCouponId("");
      setFormData({
        name: '',
        surname: '',
        email: '',
        mobile: '',
        phone: '',
        room: '',
        checkIn: '',
        checkOut: '',
        guests: '1',
        status: 'pending',
        street: '',
        street1: '',
        region: '',
        province: '',
        city: '',
        barangay: '',
        zip: '',
        country: 'Philippines',
        fax: '',
        jobTitle: '',
        company: '',
        message: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingBooking(null);
    setSelectedCouponId("");
    setConflictStatus({ hasConflict: false, type: null, message: '' });
    setRange(undefined);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validate CSRF token
    const formDataObj = new FormData(e.currentTarget);
    const csrfToken = formDataObj.get('csrf_token') as string;
    if (!csrfToken || !getCSRFToken() || csrfToken !== getCSRFToken()) {
      Swal.fire({
        icon: 'error',
        title: 'Security Error',
        text: 'Invalid security token. Please refresh the page and try again.',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    try {
      // Check for conflicts before submission
      if (conflictStatus.hasConflict) {
        Swal.fire({
          icon: 'error',
          title: conflictStatus.type === 'booking' ? 'Room not available' : 'Under maintenance',
          text: conflictStatus.message.replace(/[🚫🔧✅]/g, '').trim(),
          confirmButtonColor: '#3b82f6'
        });
        return;
      }

      // Validate dates and conflicts before saving
      const effectiveRoom = isBookingCoreFieldsLocked ? editingBooking?.room : formData.room;
      const effectiveCheckInRaw = isBookingCoreFieldsLocked ? editingBooking?.checkIn : formData.checkIn;
      const effectiveCheckOutRaw = isBookingCoreFieldsLocked ? editingBooking?.checkOut : formData.checkOut;
      const effectiveGuestsRaw = isBookingCoreFieldsLocked ? editingBooking?.guests : formData.guests;

      const roomName = effectiveRoom?.trim();
      const checkIn = effectiveCheckInRaw ? new Date(effectiveCheckInRaw).setHours(0, 0, 0, 0) : NaN;
      const checkOut = effectiveCheckOutRaw ? new Date(effectiveCheckOutRaw).setHours(0, 0, 0, 0) : NaN; // exclusive

      if (!roomName || !Number.isFinite(checkIn) || !Number.isFinite(checkOut) || checkOut <= checkIn) {
        Swal.fire({
          icon: 'error',
          title: 'Invalid dates',
          text: 'Please select a valid room and date range.',
          confirmButtonColor: '#3b82f6'
        });
        return;
      }

      // Check booking conflicts (exclude the booking being edited)
      const existing = bookedByRoom[roomName] || [];
      const overlapsBooking = existing.some(r => r.id !== editingBooking?.id && checkIn < r.end && checkOut > r.start);
      if (overlapsBooking) {
        Swal.fire({
          icon: 'error',
          title: 'Room not available',
          text: 'The selected dates overlap with an existing booking for this room.',
          confirmButtonColor: '#3b82f6'
        });
        return;
      }

      // Check maintenance conflicts
      const maintenance = maintenanceByRoom[roomName] || [];
      const overlapsMaintenance = maintenance.some(r => checkIn < r.end && checkOut > r.start);
      if (overlapsMaintenance) {
        Swal.fire({
          icon: 'error',
          title: 'Under maintenance',
          text: 'The selected dates fall within a maintenance window for this room.',
          confirmButtonColor: '#3b82f6'
        });
        return;
      }

      const roomPricing = getRoomPricingData(roomName);
      if (!roomPricing) {
        Swal.fire({
          icon: 'error',
          title: 'Room data missing',
          text: 'The selected room could not be priced. Please refresh and try again.',
          confirmButtonColor: '#3b82f6'
        });
        return;
      }

      const guests = Math.max(1, parseInt(String(effectiveGuestsRaw || '1'), 10) || 1);
      if (roomPricing.perBed && guests > 6) {
        Swal.fire({
          icon: 'warning',
          title: 'Guest Limit Exceeded',
          text: 'Dorm rooms are not available for more than 6 guests.',
          confirmButtonColor: '#f59e0b'
        });
        return;
      }

      const lockedCouponId = editingBooking?.coupon?.applied && editingBooking.coupon.id
        ? editingBooking.coupon.id
        : null;
      const couponId = lockedCouponId || (selectedCouponId && isCouponId(selectedCouponId) ? selectedCouponId : null);
      const lockedCouponMeta = lockedCouponId && editingBooking?.coupon?.applied ? {
        id: lockedCouponId,
        title: editingBooking.coupon.title || lockedCouponId,
        discountPercent: editingBooking.coupon.discountPercent || 0,
        availabilityText: editingBooking.coupon.availabilityText || '',
      } : null;
      const activeCouponMeta = couponId ? couponMap[couponId] || null : null;
      const couponMeta = activeCouponMeta
        ? {
            id: activeCouponMeta.id,
            title: activeCouponMeta.title,
            discountPercent: activeCouponMeta.discountPercent,
            availabilityText: activeCouponMeta.description,
          }
        : lockedCouponMeta;
      if (couponId && !couponMeta && !lockedCouponId) {
        Swal.fire({
          icon: 'warning',
          title: 'Coupon Not Found',
          text: 'This coupon no longer exists. Please choose another coupon.',
          confirmButtonColor: '#f59e0b'
        });
        return;
      }
      const couponAvailability = lockedCouponId
        ? {
            active: true,
            availabilityText: lockedCouponMeta?.availabilityText || 'Coupon locked to existing booking.',
          }
        : couponId
        ? (availabilityMap[couponId] || getCouponAvailability(activeCouponMeta))
        : null;
      if (couponId && !lockedCouponId && !couponAvailability?.active) {
        Swal.fire({
          icon: 'warning',
          title: 'Coupon Not Available',
          text: `${couponAvailability?.reason || 'This coupon cannot be used right now.'} Today in Asia/Manila is ${getCouponNowLabel()}.`,
          confirmButtonColor: '#f59e0b'
        });
        return;
      }

      const normalizedEmail = normalizeGuestEmail(String(formData.email || ''));
      const couponUsageDocId = couponId ? getCouponUsageDocId(normalizedEmail) : null;
      const couponUsageRef = couponUsageDocId ? doc(db, 'couponUsages', couponUsageDocId) : null;
      const shouldReserveCouponUsage = Boolean(couponUsageRef && !lockedCouponId);

      if (shouldReserveCouponUsage && couponUsageRef) {
        const usageSnapshot = await getDoc(couponUsageRef);
        if (usageSnapshot.exists()) {
          Swal.fire({
            icon: 'warning',
            title: 'Coupon Already Used',
            text: 'Only one coupon can be redeemed per guest identity (name/contact/address).',
            confirmButtonColor: '#f59e0b'
          });
          return;
        }
      }

      const basePayment = calculateBookingPayment({
        checkIn: String(effectiveCheckInRaw || ''),
        checkOut: String(effectiveCheckOutRaw || ''),
        guests,
        roomPrice: roomPricing.price,
        maxGuests: roomPricing.maxGuests,
        perBed: roomPricing.perBed,
        couponId: !lockedCouponId && couponAvailability?.active ? couponId : null,
      });
      const payment = (lockedCouponId && couponMeta)
        ? {
          ...basePayment,
          couponDiscount: Math.round((basePayment.subtotal * couponMeta.discountPercent) / 100),
          total: Math.max(0, basePayment.subtotal - Math.round((basePayment.subtotal * couponMeta.discountPercent) / 100)),
        }
        : basePayment;
      const couponIdentityLocks = (couponMeta && !lockedCouponId) ? getCouponIdentityLocks({
        name: String(formData.name || ''),
        surname: String(formData.surname || ''),
        email: String(formData.email || ''),
        mobile: String(formData.mobile || ''),
        phone: String(formData.phone || ''),
        street: String(formData.street || ''),
        street1: String(formData.street1 || ''),
        region: String(formData.region || ''),
        province: String(formData.province || ''),
        city: String(formData.city || ''),
        barangay: String(formData.barangay || ''),
        zip: String(formData.zip || ''),
        country: String(formData.country || ''),
      }) : [];
      if (!lockedCouponId && couponIdentityLocks.length > 0) {
        for (const identityLock of couponIdentityLocks) {
          const identityRef = doc(db, 'couponIdentityLocks', identityLock.identityKey);
          const identitySnapshot = await getDoc(identityRef);
          if (identitySnapshot.exists()) {
            Swal.fire({
              icon: 'warning',
              title: 'Coupon Already Used',
              text: `This guest already redeemed a coupon through the same ${identityLock.identityType}. Remove the coupon to continue without a discount.`,
              confirmButtonColor: '#f59e0b'
            });
            return;
          }
        }
      }
      const formValues = { ...formData } as Partial<Booking> & {
        id?: string;
        createdAt?: unknown;
      };
      delete formValues.id;
      delete formValues.createdAt;
      if (isBookingCoreFieldsLocked && editingBooking) {
        formValues.room = editingBooking.room;
        formValues.checkIn = editingBooking.checkIn;
        formValues.checkOut = editingBooking.checkOut;
        formValues.guests = editingBooking.guests;
      }

      // Show loading
      Swal.fire({
        title: editingBooking ? 'Updating...' : 'Creating...',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      const roomSlug = roomName.toLowerCase().trim().replace(/\s+/g, '-');
      const bookingPayload = {
        ...formValues,
        emailLower: normalizedEmail,
        roomSlug,
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
        },
        updatedAt: serverTimestamp()
      };

      // Perform the database operation
      if (editingBooking) {
        const bookingRef = doc(db, 'bookings', editingBooking.id);
        if (shouldReserveCouponUsage && couponUsageRef && couponMeta && couponUsageDocId) {
          const batch = writeBatch(db);
          batch.update(bookingRef, bookingPayload);
          batch.set(couponUsageRef, {
            emailKey: couponUsageDocId,
            emailLower: normalizedEmail,
            couponId: couponMeta.id,
            bookingId: editingBooking.id,
            source: 'admin',
            createdAt: serverTimestamp(),
          });
          couponIdentityLocks.forEach((identityLock) => {
            const identityRef = doc(db, 'couponIdentityLocks', identityLock.identityKey);
            batch.set(identityRef, {
              identityKey: identityLock.identityKey,
              identityType: identityLock.identityType,
              couponId: couponMeta.id,
              bookingId: editingBooking.id,
              source: 'admin',
              createdAt: serverTimestamp(),
            });
          });
          await batch.commit();
        } else {
          await updateDoc(bookingRef, bookingPayload);
        }
      } else {
        const bookingRef = doc(collection(db, 'bookings'));
        const batch = writeBatch(db);
        batch.set(bookingRef, {
          ...bookingPayload,
          createdAt: serverTimestamp(),
          status: formData.status || 'pending',
        });
        if (shouldReserveCouponUsage && couponUsageRef && couponMeta && couponUsageDocId) {
          batch.set(couponUsageRef, {
            emailKey: couponUsageDocId,
            emailLower: normalizedEmail,
            couponId: couponMeta.id,
            bookingId: bookingRef.id,
            source: 'admin',
            createdAt: serverTimestamp(),
          });
          couponIdentityLocks.forEach((identityLock) => {
            const identityRef = doc(db, 'couponIdentityLocks', identityLock.identityKey);
            batch.set(identityRef, {
              identityKey: identityLock.identityKey,
              identityType: identityLock.identityType,
              couponId: couponMeta.id,
              bookingId: bookingRef.id,
              source: 'admin',
              createdAt: serverTimestamp(),
            });
          });
        }
        await batch.commit();
      }

      // Close loading and show success
      await Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: editingBooking ? 'Reservation updated successfully' : 'Reservation created successfully',
        confirmButtonColor: '#3b82f6'
      });
      handleCloseModal();
    } catch (error) {
      logError('Error saving booking:', error);
      const firestoreError = error as { code?: string };
      if (firestoreError?.code === 'permission-denied' || firestoreError?.code === 'already-exists') {
        Swal.fire({
          icon: 'warning',
          title: 'Coupon Already Used',
          text: 'This guest identity has already used a coupon.',
          confirmButtonColor: '#f59e0b'
        });
        return;
      }
      const errorDetails = getEnhancedErrorMessage(error);
      Swal.fire({
        icon: 'error',
        title: errorDetails.title,
        html: `<p>${errorDetails.message}</p>${errorDetails.action ? `<p class="mt-2 text-sm text-gray-600">${errorDetails.action}</p>` : ''}`,
        confirmButtonColor: '#3b82f6'
      });
    }
  };

  const handleFilterChange = (nextFilter: ReservationFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('status', nextFilter);
    params.delete('bookingId');
    router.push(`/admin/reservations?${params.toString()}`);
  };

  const highlightedBookingId = searchParams.get('bookingId');

  // Keep completed bookings out of the default queue, but show them when the Completed filter is selected.
  const filteredBookings = (filter === 'all' ? bookings.filter(b => b.status !== 'completed') : bookings.filter(b => b.status === filter))
    .filter((b) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        `${b.name} ${b.surname}`.toLowerCase().includes(q) ||
        (b.email || '').toLowerCase().includes(q) ||
        (b.mobile || '').toLowerCase().includes(q) ||
        (b.room || '').toLowerCase().includes(q) ||
        (b.status || '').toLowerCase().includes(q) ||
        (b.coupon?.title || '').toLowerCase().includes(q) ||
        (b.coupon?.id || '').toLowerCase().includes(q) ||
        new Date(b.checkIn).toLocaleDateString().toLowerCase().includes(q) ||
        new Date(b.checkOut).toLocaleDateString().toLowerCase().includes(q)
      );
    });

  // Pagination
  const totalPages = Math.ceil(filteredBookings.length / itemsPerPage);
  const paginatedBookings = filteredBookings.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1a3a52' }}>
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <Header />

      <AdminMainContent>
        <div className="admin-page-header mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Reservations</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
              Manage all hotel bookings
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Create new reservation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Reservation
          </button>
        </div>

        {/* Search + Filter */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                </svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search reservations…"
                  className="bg-transparent outline-none text-sm font-medium text-gray-700 dark:text-gray-300 placeholder-gray-500 dark:placeholder-gray-400 w-full"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleFilterChange('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              All ({bookings.filter(b => b.status !== 'completed').length})
            </button>
            <button
              onClick={() => handleFilterChange('pending')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'pending'
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Pending ({bookings.filter(b => b.status === 'pending').length})
            </button>
            <button
              onClick={() => handleFilterChange('confirmed')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'confirmed'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Confirmed ({bookings.filter(b => b.status === 'confirmed').length})
            </button>
            <button
              onClick={() => handleFilterChange('in-progress')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'in-progress'
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              In-House ({bookings.filter(b => b.status === 'in-progress').length})
            </button>
            <button
              onClick={() => handleFilterChange('cancelled')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'cancelled'
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Cancelled ({bookings.filter(b => b.status === 'cancelled').length})
            </button>
            <button
              onClick={() => handleFilterChange('completed')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'completed'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Completed ({bookings.filter(b => b.status === 'completed').length})
            </button>
            </div>
          </div>
        </div>

        {/* Reservations Table */}
        <div className="admin-table-shell bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-data-table w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider border-r border-gray-200 dark:border-gray-600">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider border-r border-gray-200 dark:border-gray-600">Guest Info</th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-gray-200 dark:border-gray-600">Room</th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-gray-200 dark:border-gray-600">Dates</th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-gray-200 dark:border-gray-600 text-center">Guests</th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-gray-200 dark:border-gray-600">Status</th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={17} className="px-6 py-12 text-center">
                      <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4"></div>
                      <p className="text-gray-500 dark:text-gray-400 font-medium">Loading reservations...</p>
                    </td>
                  </tr>
                ) : filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="px-6 py-12 text-center">
                      <div className="mx-auto w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <p className="text-gray-500 dark:text-gray-400 font-medium text-lg">No reservations found</p>
                    </td>
                  </tr>
                ) : (
                  paginatedBookings.map((booking, index) => (
                    <tr
                      key={booking.id}
                      className={`transition-colors ${
                        highlightedBookingId === booking.id
                          ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-inset ring-blue-400'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                        #{(currentPage - 1) * itemsPerPage + index + 1}
                      </td>
                      <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-700">
                        <div className="font-semibold text-gray-900 dark:text-white">{booking.name} {booking.surname}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{booking.email}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{booking.mobile}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                        {booking.room}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                        <div className="font-medium">{new Date(booking.checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">to {new Date(booking.checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 whitespace-nowrap text-center">
                        {booking.guests}
                      </td>
                      <td className="px-4 py-3 text-sm border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                        <span className={`px-3 py-1.5 text-xs font-bold rounded-lg ${getStatusColor(booking.status)} capitalize inline-block`}>
                          {formatStatusLabel(booking.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Status Dropdown */}
                          <div className="relative">
                            <button
                              onClick={() => setOpenDropdown(openDropdown === booking.id ? null : booking.id)}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 flex items-center gap-1.5"
                              title="Change Status"
                              aria-label={`Change status for ${booking.name} ${booking.surname}`}
                              aria-expanded={openDropdown === booking.id}
                              aria-haspopup="true"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                              </svg>
                              <span>Status</span>
                            </button>
                            {openDropdown === booking.id && (
                              <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                                <button
                                  onClick={() => {
                                    updateBookingStatus(booking.id, 'confirmed');
                                    setOpenDropdown(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center gap-2 rounded-t-lg transition-colors font-medium"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Accept
                                </button>
                                {booking.status === 'confirmed' && (
                                  <button
                                    onClick={() => {
                                      updateBookingStatus(booking.id, 'in-progress');
                                      setOpenDropdown(null);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex items-center gap-2 transition-colors font-medium"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Check In
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    updateBookingStatus(booking.id, 'pending');
                                    setOpenDropdown(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center gap-2 transition-colors font-medium"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  Pending
                                </button>
                                <button
                                  onClick={() => {
                                    updateBookingStatus(booking.id, 'cancelled');
                                    setOpenDropdown(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors font-medium"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                  Reject
                                </button>
                                {(booking.status === 'confirmed' || booking.status === 'in-progress') && (
                                  <button
                                    onClick={() => {
                                      updateBookingStatus(booking.id, 'completed');
                                      setOpenDropdown(null);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2 rounded-b-lg transition-colors font-medium"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Mark as Completed
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => {
                              setViewDetailsBooking(booking);
                              setIsViewDetailsOpen(true);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 flex items-center gap-1.5"
                            title="View Details"
                            aria-label={`View details for ${booking.name} ${booking.surname}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span>Details</span>
                          </button>

                          <button
                            onClick={() => printBooking(booking)}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 flex items-center gap-1.5"
                            title="Print"
                            aria-label={`Print reservation for ${booking.name} ${booking.surname}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            <span>Print</span>
                          </button>
                          <button
                            onClick={() => handleOpenModal(booking)}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 flex items-center gap-1.5"
                            title="Edit"
                            aria-label={`Edit reservation for ${booking.name} ${booking.surname}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => deleteBooking(booking.id)}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 flex items-center gap-1.5"
                            title="Delete"
                            aria-label={`Delete reservation for ${booking.name} ${booking.surname}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredBookings.length > 0 && (
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredBookings.length)} of {filteredBookings.length} reservations
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      // Show first, last, current, and adjacent pages
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                              currentPage === page
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      } else if (
                        page === currentPage - 2 ||
                        page === currentPage + 2
                      ) {
                        return <span key={page} className="text-gray-500 px-1">...</span>;
                      }
                      return null;
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Create/Edit Modal */}
        {isModalOpen && (
          <ModalWithFocusTrap
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            title={editingBooking ? 'Edit Reservation' : 'Create New Reservation'}
          >
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* CSRF Token */}
              <input type="hidden" name="csrf_token" value={getCSRFToken() || ''} />
                {/* Guest Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Guest Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        disabled={isIdentityFieldsLocked}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.surname || ''}
                        onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                        disabled={isIdentityFieldsLocked}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        disabled={isIdentityFieldsLocked}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                      {isIdentityFieldsLocked && (
                        <p className="text-xs text-gray-500 mt-1">
                          Identity fields are locked because this reservation already consumed a one-time coupon.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Mobile <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={formData.mobile || ''}
                        onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                        disabled={isIdentityFieldsLocked}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                      <input
                        type="tel"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        disabled={isIdentityFieldsLocked}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>

                {/* Booking Details */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Booking Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Room <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formData.room || ''}
                        onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                        disabled={isBookingCoreFieldsLocked}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                      >
                        <option value="">-- Select a Room --</option>
                        {rooms.map((room) => (
                          <option key={room.id || room.name} value={room.name}>
                            {room.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Number of Guests <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={formData.guests || '1'}
                        onChange={(e) => setFormData({ ...formData, guests: e.target.value })}
                        disabled={isBookingCoreFieldsLocked}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Coupon <span className="text-gray-400 font-normal">(Optional)</span>
                      </label>
                      <select
                        value={selectedCouponId}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setSelectedCouponId(nextValue && isCouponId(nextValue) ? nextValue : "");
                        }}
                        disabled={Boolean(editingBooking?.coupon?.applied)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                      <p className="text-xs text-gray-500 mt-1">
                        One coupon only per guest identity (name/contact/address), one-time use.
                      </p>
                      {editingBooking?.coupon?.applied && (
                        <p className="text-xs text-amber-700 mt-1">
                          Coupon is locked for this booking to preserve one-time redemption integrity.
                        </p>
                      )}
                      {!isLockedCouponSelection && selectedCouponId && !selectedAdminCouponAvailability?.active && (
                        <p className="text-xs text-amber-700 mt-1">
                          {selectedAdminCouponAvailability?.reason || 'Coupon cannot be used right now.'} Time reference: Asia/Manila ({getCouponNowLabel()}).
                        </p>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Select Dates (Check-in to Check-out) <span className="text-red-500">*</span>
                      </label>
                      {!formData.room ? (
                        <div className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-8 text-center">
                          <svg className="w-12 h-12 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-gray-500 dark:text-gray-400 font-medium">Please select a room first</p>
                        </div>
                      ) : (
                        <div className={`rounded-lg border-2 p-4 transition-colors ${isBookingCoreFieldsLocked ? 'opacity-60 pointer-events-none' : ''} ${
                          conflictStatus.hasConflict
                            ? conflictStatus.type === 'booking'
                              ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                              : 'border-orange-300 bg-orange-50 dark:bg-orange-900/10 dark:border-orange-800'
                            : formData.checkIn && formData.checkOut
                            ? 'border-green-300 bg-green-50 dark:bg-green-900/10 dark:border-green-800'
                            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                        }`}>
                          <DayPicker
                            mode="range"
                            selected={range}
                            onSelect={isBookingCoreFieldsLocked ? undefined : setRange}
                            disabled={[{ before: new Date() }, ...disabledRanges()]}
                            numberOfMonths={1}
                            showOutsideDays
                            weekStartsOn={1}
                            captionLayout="dropdown"
                            className="dark:text-white"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            ℹ️ Blocked dates are already booked or under maintenance. Checkout day is available for new check-ins.
                          </p>
                        </div>
                      )}
                      {isBookingCoreFieldsLocked && (
                        <p className="text-xs text-amber-700 mt-2">
                          Room, guest count, and stay dates are locked because a coupon is attached to this booking.
                        </p>
                      )}
                    </div>
                    {/* Conflict Status Indicator */}
                    {formData.room && formData.checkIn && formData.checkOut && (
                      <div className="md:col-span-2">
                        <div className={`px-4 py-3 rounded-lg flex items-start gap-3 ${
                          conflictStatus.hasConflict
                            ? conflictStatus.type === 'booking'
                              ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                              : 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800'
                            : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                        }`}>
                          <span className="text-lg mt-0.5">
                            {conflictStatus.hasConflict
                              ? conflictStatus.type === 'booking'
                                ? '🚫'
                                : '🔧'
                              : '✅'
                            }
                          </span>
                          <div>
                            <p className={`text-sm font-semibold ${
                              conflictStatus.hasConflict
                                ? conflictStatus.type === 'booking'
                                  ? 'text-red-700 dark:text-red-400'
                                  : 'text-orange-700 dark:text-orange-400'
                                : 'text-green-700 dark:text-green-400'
                            }`}>
                              {conflictStatus.hasConflict
                                ? conflictStatus.type === 'booking'
                                  ? 'Booking Conflict'
                                  : 'Maintenance Block'
                                : 'Available'
                              }
                            </p>
                            <p className={`text-sm mt-1 ${
                              conflictStatus.hasConflict
                                ? conflictStatus.type === 'booking'
                                  ? 'text-red-600 dark:text-red-300'
                                  : 'text-orange-600 dark:text-orange-300'
                                : 'text-green-600 dark:text-green-300'
                            }`}>
                              {conflictStatus.message}
                            </p>
                            {conflictStatus.hasConflict && (
                              <p className="text-xs mt-2 text-gray-600 dark:text-gray-400">
                                Please select different dates or choose another room.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Status <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formData.status || 'pending'}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      >
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="in-progress">In Progress</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Address
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Country <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="country"
                        required
                        value={formData.country || 'Philippines'}
                        onChange={handleAddressChange}
                        disabled={isIdentityFieldsLocked}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                      >
                        <option value="Philippines">Philippines</option>
                        <option value="United States">United States</option>
                        <option value="Japan">Japan</option>
                        <option value="South Korea">South Korea</option>
                        <option value="China">China</option>
                      </select>
                      {formData.country === "Philippines" && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Address dropdowns will auto-populate</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Region <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="region"
                        required
                        value={formData.region || ''}
                        onChange={handleAddressChange}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        disabled={isIdentityFieldsLocked || addressLoading || formData.country !== "Philippines"}
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
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Province <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="province"
                        required
                        value={formData.province || ''}
                        onChange={handleAddressChange}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        disabled={isIdentityFieldsLocked || addressLoading || !formData.region}
                      >
                        <option value="">Select Province</option>
                        {provinces.map((province) => (
                          <option key={province.code} value={province.name}>
                            {province.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        City/Municipality <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="city"
                        required
                        value={formData.city || ''}
                        onChange={handleAddressChange}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        disabled={isIdentityFieldsLocked || addressLoading || !formData.province}
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
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Barangay <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="barangay"
                        required
                        value={formData.barangay || ''}
                        onChange={handleAddressChange}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        disabled={isIdentityFieldsLocked || addressLoading || !formData.city}
                      >
                        <option value="">Select Barangay</option>
                        {barangays.map((barangay) => (
                          <option key={barangay.code} value={barangay.name}>
                            {barangay.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Street/Building <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="street"
                        required
                        value={formData.street || ''}
                        onChange={handleAddressChange}
                        disabled={isIdentityFieldsLocked}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                        placeholder="House No., Street Name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        ZIP Code <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="zip"
                        required
                        value={formData.zip || ''}
                        onChange={handleAddressChange}
                        disabled={isIdentityFieldsLocked}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                        placeholder="8307"
                      />
                    </div>
                  </div>
                  {isIdentityFieldsLocked && (
                    <p className="text-xs text-amber-700 mt-2">
                      Address fields are locked because coupon redemption identity is already recorded.
                    </p>
                  )}
                </div>

                {/* Company Details */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Company Details (Optional)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company Name</label>
                      <input
                        type="text"
                        value={formData.company || ''}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Job Title</label>
                      <input
                        type="text"
                        value={formData.jobTitle || ''}
                        onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Special Requests */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Special Requests</label>
                  <textarea
                    rows={3}
                    value={formData.message || ''}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="Any special requirements or requests..."
                  />
                </div>

                {/* Form Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-6 py-2.5 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={conflictStatus.hasConflict || (!isLockedCouponSelection && selectedCouponId ? !selectedAdminCouponAvailability?.active : false)}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    {editingBooking ? 'Update Reservation' : 'Create Reservation'}
                  </button>
                </div>
              </form>
          </ModalWithFocusTrap>
        )}

        {/* View Details Modal */}
        {isViewDetailsOpen && viewDetailsBooking && (
          <ModalWithFocusTrap
            isOpen={isViewDetailsOpen}
            onClose={() => {
              setIsViewDetailsOpen(false);
              setViewDetailsBooking(null);
            }}
            title="Reservation Details"
          >
            <div className="p-6 space-y-6">
              {/* Guest Details */}
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Guest Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6">
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Name</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{viewDetailsBooking.name} {viewDetailsBooking.surname}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Email</span>
                    <span className="text-sm text-gray-900 dark:text-white">{viewDetailsBooking.email}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Mobile</span>
                    <span className="text-sm text-gray-900 dark:text-white">{viewDetailsBooking.mobile}</span>
                  </div>
                  {viewDetailsBooking.phone && (
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Phone</span>
                      <span className="text-sm text-gray-900 dark:text-white">{viewDetailsBooking.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Address Details */}
              {(viewDetailsBooking.street || viewDetailsBooking.city || viewDetailsBooking.province) && (
                <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                  <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Address & Company</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6">
                    <div className="sm:col-span-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Full Address</span>
                      <span className="text-sm text-gray-900 dark:text-white">
                        {[
                          viewDetailsBooking.street,
                          viewDetailsBooking.street1,
                          viewDetailsBooking.barangay,
                          viewDetailsBooking.city,
                          viewDetailsBooking.province,
                          viewDetailsBooking.zip,
                          viewDetailsBooking.country
                        ].filter(Boolean).join(', ')}
                      </span>
                    </div>
                    {viewDetailsBooking.company && (
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Company</span>
                        <span className="text-sm text-gray-900 dark:text-white">{viewDetailsBooking.company}</span>
                      </div>
                    )}
                    {viewDetailsBooking.jobTitle && (
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Job Title</span>
                        <span className="text-sm text-gray-900 dark:text-white">{viewDetailsBooking.jobTitle}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Booking Configuration */}
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Booking Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6">
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Room</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{viewDetailsBooking.room}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Guests</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{viewDetailsBooking.guests}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Check-in</span>
                    <span className="text-sm text-gray-900 dark:text-white">{new Date(viewDetailsBooking.checkIn).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Check-out</span>
                    <span className="text-sm text-gray-900 dark:text-white">{new Date(viewDetailsBooking.checkOut).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </div>
                </div>
              </div>

              {/* Payment Details */}
              {viewDetailsBooking.payment && (
                <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                  <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Payment Information</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-600 dark:text-gray-300">
                      <span>Base Price ({viewDetailsBooking.payment.nights} nights)</span>
                      <span>{formatCurrency(viewDetailsBooking.payment.basePrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {viewDetailsBooking.payment.extraFee > 0 && (
                      <div className="flex justify-between text-gray-600 dark:text-gray-300">
                        <span>Extra Guest Fee</span>
                        <span>{formatCurrency(viewDetailsBooking.payment.extraFee, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {viewDetailsBooking.coupon?.applied && (
                      <div className="flex justify-between text-green-600 dark:text-green-400 font-medium pt-1">
                        <span>Coupon: {viewDetailsBooking.coupon.title || viewDetailsBooking.coupon.id}</span>
                        <span>-{formatCurrency(viewDetailsBooking.payment.couponDiscount || 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-900 dark:text-white font-bold pt-2 border-t border-gray-200 dark:border-gray-600 mt-2">
                      <span>Total Price</span>
                      <span className="text-blue-600 dark:text-blue-400">{formatCurrency(viewDetailsBooking.payment.total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Special Requests */}
              {viewDetailsBooking.message && (
                <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
                  <h3 className="text-sm font-bold text-amber-800 dark:text-amber-500 uppercase tracking-wider mb-2">Special Requests</h3>
                  <p className="text-sm text-amber-900 dark:text-amber-400 whitespace-pre-wrap">{viewDetailsBooking.message}</p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => printBooking(viewDetailsBooking)}
                  className="px-6 py-2.5 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 font-medium transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsViewDetailsOpen(false);
                    setViewDetailsBooking(null);
                  }}
                  className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </ModalWithFocusTrap>
        )}
      </AdminMainContent>
    </div>
  );
}

function AdminPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1a3a52' }}>
      <div className="text-white text-xl">Loading...</div>
    </div>
  );
}

export default function Reservations() {
  return (
    <Suspense fallback={<AdminPageFallback />}>
      <ReservationsContent />
    </Suspense>
  );
}
