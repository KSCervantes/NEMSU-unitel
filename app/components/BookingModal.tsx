"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import Swal from 'sweetalert2';
import { DayPicker } from 'react-day-picker';
import type { DateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import Image from "next/image";
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { useFocusTrap } from '@/app/hooks/useFocusTrap';
import { useKeyboardNavigation } from '@/app/hooks/useKeyboardNavigation';
import { logError } from '@/lib/logger';
import { Room } from '@/lib/types/room';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRoom?: string;
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

export default function BookingModal({ isOpen, onClose, selectedRoom }: BookingModalProps) {
  // Enable keyboard navigation
  useKeyboardNavigation();

  const EXTRA_GUEST_FEE = 200;

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
    message: "",
  });

  const [regions, setRegions] = useState<Region[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [loading, setLoading] = useState(false);
  const [bookedByRoom, setBookedByRoom] = useState<Record<string, { start: number; end: number }[]>>({});
  const [dateConflict, setDateConflict] = useState<string | null>(null);
  const [maintenanceConflict, setMaintenanceConflict] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | undefined>();
  const [checkInTime, setCheckInTime] = useState<string>("15:00");
  const [checkOutTime, setCheckOutTime] = useState<string>("11:00");
  const [maintenanceByRoom, setMaintenanceByRoom] = useState<Record<string, { start: number; end: number }[]>>({});

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

  // Fetch rooms from Firestore when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchRooms = async () => {
      try {
        setRoomsLoading(true);
        const roomsRef = collection(db, 'rooms');
        const snapshot = await getDocs(roomsRef);

        const roomsData: Room[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          roomsData.push({
            id: doc.id,
            name: data.name,
            price: data.price,
            priceNumber: data.priceNumber || parseFloat(data.price?.replace(/,/g, '') || '0'),
            description: data.description,
            image: data.image,
            perBed: data.perBed,
            maxGuests: data.maxGuests || 2,
            slug: data.slug || doc.id,
            createdAt: data.createdAt,
          } as Room);
        });

        // Deduplicate by name (in case of duplicates)
        const unique = Array.from(
          new Map(roomsData.map((r) => [r.name, r])).values()
        );
        setRooms(unique);
      } catch (error) {
        logError('Error fetching rooms:', error);
      } finally {
        setRoomsLoading(false);
      }
    };

    fetchRooms();
  }, [isOpen]);

  // Update room when selectedRoom prop changes
  useEffect(() => {
    if (selectedRoom) {
      setFormData(prev => ({ ...prev, room: selectedRoom }));
    }
  }, [selectedRoom]);

  // Subscribe to bookings in real time to block overlapping dates
  useEffect(() => {
    if (!isOpen) return;
    const unsub = onSnapshot(collection(db, 'bookings'), (snap) => {
      const map: Record<string, { start: number; end: number }[]> = {};
      snap.forEach((doc) => {
        const d = doc.data() as any;
        if (!d?.room || !d?.checkIn || !d?.checkOut) return;
        // Only block confirmed bookings - pending bookings don't affect room availability
        if (d.status === 'confirmed') {
          const start = new Date(d.checkIn).getTime();
          const end = new Date(d.checkOut).getTime();
          if (!Number.isFinite(start) || !Number.isFinite(end)) return;
          if (!map[d.room]) map[d.room] = [];
          map[d.room].push({ start, end });
        }
      });
      setBookedByRoom(map);
    });
    return () => unsub();
  }, [isOpen]);

  // Subscribe to maintenance windows (if date ranges exist) to disable those days too
  useEffect(() => {
    if (!isOpen) return;
    const q = query(collection(db, 'maintenance'), where('status', 'in', ['pending', 'in-progress']));
    const unsub = onSnapshot(q, (snap) => {
      const map: Record<string, { start: number; end: number }[]> = {};
      snap.forEach((doc) => {
        const d = doc.data() as any;
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

  const rangeOverlaps = (roomName: string, startIso?: string, endIso?: string) => {
    if (!roomName || !startIso || !endIso) return false;
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
    const ranges = bookedByRoom[roomName] || [];
    // Treat checkout as exclusive; overlap if [start, end) intersects any existing [r.start, r.end)
    return ranges.some(r => start < r.end && end > r.start);
  };

  // Validate date selection against existing bookings
  useEffect(() => {
    if (!formData.room || !formData.checkIn || !formData.checkOut) {
      setDateConflict(null);
      setMaintenanceConflict(null);
      return;
    }
    // Booking conflict
    if (rangeOverlaps(formData.room, formData.checkIn, formData.checkOut)) {
      setDateConflict('Selected dates overlap an existing reservation for this room.');
    } else {
      setDateConflict(null);
    }
    // Maintenance conflict
    const start = new Date(formData.checkIn).getTime();
    const end = new Date(formData.checkOut).getTime();
    const maintRanges = maintenanceByRoom[formData.room] || [];
    const overlapsMaintenance = maintRanges.some(r => start < r.end && end > r.start);
    if (overlapsMaintenance) {
      setMaintenanceConflict('Selected dates overlap with a maintenance period. Booking is not allowed during maintenance.');
    } else {
      setMaintenanceConflict(null);
    }
  }, [formData.room, formData.checkIn, formData.checkOut, bookedByRoom, maintenanceByRoom]);

  // Update form dates when the day picker range changes; checkout is exclusive
  useEffect(() => {
    if (!range?.from || !range?.to) return;
    const [ciH, ciM] = checkInTime.split(":").map(Number);
    const [coH, coM] = checkOutTime.split(":").map(Number);
    const from = new Date(range.from);
    from.setHours(ciH || 15, ciM || 0, 0, 0);
    const to = new Date(range.to);
    to.setHours(coH || 11, coM || 0, 0, 0);
    setFormData((prev) => ({
      ...prev,
      checkIn: from.toISOString(),
      checkOut: to.toISOString(),
    }));
  }, [range, checkInTime, checkOutTime]);

  // Build disabled day intervals for the selected room (checkout exclusive)
  const disabledRanges = () => {
    const r = bookedByRoom[formData.room] || [];
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
    return [...toIntervals(r), ...toIntervals(m)];
  };

  // Get selected room data from fetched rooms
  const selectedRoomObj = formData.room ? rooms.find(r => r.name === formData.room) : null;
  const selectedRoomData = formData.room ? getRoomData(formData.room) : null;

  // Calculate nights and total price
  const calculateStay = () => {
    if (!formData.checkIn || !formData.checkOut || !selectedRoomData) {
      return { nights: 0, totalPrice: 0, extraGuests: 0, extraGuestFee: 0 };
    }

    const checkIn = new Date(formData.checkIn);
    const checkOut = new Date(formData.checkOut);
    const diffTime = checkOut.getTime() - checkIn.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const nights = diffDays > 0 ? diffDays : 0;

    const roomInfo = getRoomData(formData.room);
    if (!roomInfo) {
      return { nights: 0, totalPrice: 0, extraGuests: 0, extraGuestFee: 0 };
    }

    const pricePerNight = roomInfo.price;
    const guestsCount = parseInt(formData.guests) || 1;
    const maxGuests = roomInfo.maxGuests;

    let totalPrice = 0;
    let extraGuests = 0;
    let extraGuestFee = 0;

    // For rooms with perBed pricing, multiply by number of guests (price per bed)
    if (roomInfo.perBed) {
      totalPrice = pricePerNight * guestsCount * nights;
    } else {
      // Base price for the room
      totalPrice = pricePerNight * nights;

      // Check if guests exceed the room limit
      if (guestsCount > maxGuests) {
        extraGuests = guestsCount - maxGuests;
        extraGuestFee = extraGuests * EXTRA_GUEST_FEE * nights;
        totalPrice += extraGuestFee;
      }
    }

    return { nights, totalPrice, extraGuests, extraGuestFee };
  };

  const { nights, totalPrice, extraGuests, extraGuestFee } = calculateStay();

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
      // Final guard to prevent double booking or maintenance
      if (rangeOverlaps(formData.room, formData.checkIn, formData.checkOut)) {
        Swal.fire({
          icon: 'warning',
          title: 'Dates Not Available',
          text: 'These dates are already reserved for this room. Please choose different dates.',
          confirmButtonColor: '#f59e0b'
        });
        setLoading(false);
        return;
      }
      const start = new Date(formData.checkIn).getTime();
      const end = new Date(formData.checkOut).getTime();
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
      // Calculate payment
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

      const nights = Math.max(1, Math.ceil((new Date(formData.checkOut).getTime() - new Date(formData.checkIn).getTime()) / (1000 * 60 * 60 * 24)));
      const guests = parseInt(formData.guests) || 1;

      let basePrice = 0;
      let extraFee = 0;
      let totalPayment = 0;

      // For rooms with perBed pricing: multiply by number of guests
      if (roomInfo.perBed) {
        basePrice = roomInfo.price * guests * nights;
        totalPayment = basePrice;
        // No extra guest fee for per-bed pricing
      } else {
        // For other rooms: base price per night, extra fee for guests exceeding max
        const extraGuests = Math.max(0, guests - roomInfo.maxGuests);
        basePrice = roomInfo.price * nights;
        extraFee = extraGuests * EXTRA_GUEST_FEE * nights;
        totalPayment = basePrice + extraFee;
      }

      // Save booking to Firestore
      const roomSlug = (formData.room || '').toLowerCase().trim().replace(/\s+/g, '-');
      const bookingRef = await addDoc(collection(db, 'bookings'), {
        ...formData,
        roomSlug,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        payment: {
          nights,
          guests,
          basePrice,
          extraFee,
          total: totalPayment
        }
      });

      // Send confirmation email to guest
      try {
        const emailResponse = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: formData.email,
            subject: `Booking Request Received - NEMSU Hotel (ID: ${bookingRef.id})`,
            html: await import('@/lib/emailTemplates').then(mod =>
              mod.generateBookingConfirmationEmail(
                `${formData.name} ${formData.surname}`,
                bookingRef.id,
                formData.room,
                new Date(formData.checkIn).toLocaleDateString('en-US', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                }),
                new Date(formData.checkOut).toLocaleDateString('en-US', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                }),
                parseInt(formData.guests)
              )
            ),
            type: 'confirmation'
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
        html: `<div class="text-left"><p><strong>Booking ID:</strong> ${bookingRef.id}</p><p><strong>Confirmation will be sent to:</strong> ${formData.email}</p><p class="text-sm text-gray-600 mt-2">We'll contact you soon with booking confirmation.</p></div>`,
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
                    <span className="text-2xl sm:text-3xl font-bold text-blue-900">₱{selectedRoomData.price}</span>
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
                          <span className="text-xs text-gray-500 italic">Price per bed × guests × nights</span>
                        </div>
                      )}
                      {extraGuests > 0 && !selectedRoomData.perBed && (
                        <>
                          <div className="flex justify-between items-center mb-1 text-orange-600 text-xs sm:text-sm">
                            <span>Extra guests ({extraGuests}):</span>
                            <span className="font-semibold">₱{EXTRA_GUEST_FEE} × {extraGuests} × {nights} nights</span>
                          </div>
                          <div className="flex justify-between items-center mb-1 text-orange-600 text-xs sm:text-sm">
                            <span className="font-semibold">Extra guest fee:</span>
                            <span className="font-bold">₱{extraGuestFee.toLocaleString()}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between items-center pt-2 border-t border-blue-200">
                        <span className="text-sm sm:text-md font-semibold text-gray-700">Total Amount:</span>
                        <span className="text-xl sm:text-2xl font-bold text-amber-500">₱{totalPrice.toLocaleString()}</span>
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
              <input
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">Check-out Time</label>
              <input
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              />
            </div>
          </div>

          {dateConflict && (
            <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
              {dateConflict} Checkout day is free for a new check-in.
            </div>
          )}
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
                ) : (
                  rooms.map((room) => (
                    <option key={room.id || room.name} value={room.name}>
                      {room.name} - ₱{room.price}{room.perBed ? room.perBed : ''}
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
                  Array.from({ length: selectedRoomData.maxGuests }, (_, i) => i + 1).map((num) => (
                    <option key={num} value={num.toString()}>
                      {num} {num === 1 ? 'Guest' : 'Guests'}
                    </option>
                  )).concat(
                    selectedRoomData.maxGuests < 10 ? (
                      <option key="more" value={(selectedRoomData.maxGuests + 1).toString()}>
                        {selectedRoomData.maxGuests + 1}+ Guests (Extra fee applies)
                      </option>
                    ) : []
                  )
                )}
              </select>
            </div>
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
                  Your booking will be submitted as <span className="font-semibold">pending</span> and requires admin confirmation.
                  Once confirmed by our staff, your room will be officially reserved and blocked for your dates.
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
                  <span className="text-gray-700 font-medium">Number of nights:</span>
                  <span className="text-blue-900 font-bold">{nights} {nights === 1 ? 'night' : 'nights'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-blue-200">
                  <span className="text-gray-700 font-medium">Number of guests:</span>
                  <span className="text-blue-900 font-bold">{formData.guests}</span>
                </div>
                {selectedRoomData?.perBed && (
                  <div className="flex justify-between items-center py-2 border-b border-blue-200">
                    <span className="text-gray-600 text-xs italic">Price per bed × guests × nights</span>
                  </div>
                )}
                {extraGuests > 0 && !selectedRoomData?.perBed && (
                  <>
                    <div className="flex justify-between items-center py-2 border-b border-orange-200 bg-orange-50 px-3 rounded">
                      <span className="text-orange-700 font-medium">Extra guests ({extraGuests}):</span>
                      <span className="text-orange-800 font-semibold">₱{EXTRA_GUEST_FEE} × {extraGuests} × {nights} nights</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-orange-200 bg-orange-50 px-3 rounded">
                      <span className="text-orange-700 font-medium">Extra guest fee:</span>
                      <span className="text-orange-800 font-bold">₱{extraGuestFee.toLocaleString()}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between items-center py-2 sm:py-3 mt-2 bg-amber-100 rounded-lg px-3">
                  <span className="text-gray-800 font-bold text-sm sm:text-base">Total Amount:</span>
                  <span className="text-lg sm:text-2xl font-bold text-amber-600">₱{totalPrice.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={!!dateConflict || !!maintenanceConflict || loading || !range?.from || !range?.to}
            className={`w-full text-white py-3 sm:py-4 rounded-full font-bold text-sm sm:text-lg hover:opacity-90 transition-all shadow-lg hover:shadow-xl active:scale-95 ${(dateConflict || maintenanceConflict) ? 'opacity-60 cursor-not-allowed' : ''}`}
            style={{ backgroundColor: '#2d4f6c' }}
          >
            BOOK NOW
          </button>
        </form>
      </div>
    </div>
  );
}
