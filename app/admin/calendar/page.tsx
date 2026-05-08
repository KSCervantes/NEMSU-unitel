"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminMainContent from '../components/AdminMainContent';
import { useAdminCurrency } from '../hooks/useAdminCurrency';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';
import Swal from 'sweetalert2';

interface Room {
  id: string;
  name?: string;
  number?: string;
  type?: string;
  price?: string;
  rate?: number;
  capacity?: number;
  status?: string;
}

interface Booking {
  id: string;
  name: string;
  surname?: string;
  room: string;
  checkIn: string;
  checkOut: string;
  status: string;
  email?: string;
  phone?: string;
  mobile?: string;
  guests?: number | string;
  totalPrice?: number;
  payment?: {
    total?: number;
  };
}

interface MaintenanceTask {
  id: string;
  title: string;
  room: string;
  status: string;
  dueDate?: string;
  startDate?: string;
  priority: string;
  description?: string;
}

type CalendarView = 'monthly' | 'timeline';
type BookingCardType = 'check-in' | 'check-out' | 'ongoing';

const DAY_MS = 24 * 60 * 60 * 1000;
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const calendarLegendItems = [
  {
    colorName: 'Green',
    meaning: 'Available',
    description: 'All rooms are open for booking.',
    swatchClassName: 'bg-green-500',
    textClassName: 'text-green-700 dark:text-green-300'
  },
  {
    colorName: 'Blue',
    meaning: 'Occupied',
    description: 'At least one room has an active stay.',
    swatchClassName: 'bg-blue-500',
    textClassName: 'text-blue-700 dark:text-blue-300'
  },
  {
    colorName: 'Orange',
    meaning: 'Check-in / Check-out',
    description: 'A guest arrives or leaves on that date.',
    swatchClassName: 'bg-orange-500',
    textClassName: 'text-orange-700 dark:text-orange-300'
  },
  {
    colorName: 'Red',
    meaning: 'Full',
    description: 'No rooms are available for booking.',
    swatchClassName: 'bg-red-500',
    textClassName: 'text-red-700 dark:text-red-300'
  },
  {
    colorName: 'Yellow',
    meaning: 'Maintenance',
    description: 'A room has active maintenance work.',
    swatchClassName: 'bg-yellow-500',
    textClassName: 'text-yellow-700 dark:text-yellow-300'
  }
] as const;

const normalizeDate = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const parseDateOnly = (value?: string) => {
  if (!value) return null;

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (dateOnlyMatch) {
    return new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return normalizeDate(parsed);
};

const datesAreSame = (left: Date | null, right: Date) =>
  Boolean(left && left.getTime() === normalizeDate(right).getTime());

const formatFullDate = (date: Date) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date);

const formatShortDate = (date: Date) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);

const formatStoredDate = (value?: string) => {
  const parsed = parseDateOnly(value);
  return parsed ? formatShortDate(parsed) : 'Not set';
};

const formatStayRange = (booking: Booking) =>
  `${formatStoredDate(booking.checkIn)} - ${formatStoredDate(booking.checkOut)}`;

const formatStatusLabel = (status?: string) =>
  (status || 'unknown')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const getGuestName = (booking: Booking) =>
  [booking.name, booking.surname].filter(Boolean).join(' ').trim() || 'Guest';

const getRoomName = (room: Room) =>
  (room.name || room.number || room.type || 'Room').trim();

const roomMatches = (roomName: string, value?: string) =>
  Boolean(value && value.trim().toLowerCase() === roomName.trim().toLowerCase());

const isActiveBooking = (booking: Booking) =>
  booking.status === 'confirmed' || booking.status === 'in-progress';

const getBookingTotal = (booking: Booking) => booking.payment?.total ?? booking.totalPrice ?? null;

const getNightCount = (booking: Booking) => {
  const checkIn = parseDateOnly(booking.checkIn);
  const checkOut = parseDateOnly(booking.checkOut);
  if (!checkIn || !checkOut || checkOut <= checkIn) return null;
  return Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / DAY_MS));
};

const getMaintenanceDateRange = (task: MaintenanceTask) => {
  const start = parseDateOnly(task.startDate) ?? parseDateOnly(task.dueDate);
  const due = parseDateOnly(task.dueDate) ?? start;
  if (!start || !due) return null;
  return {
    start: due < start ? due : start,
    end: due < start ? start : due
  };
};

const getTimelineDays = (anchorDate: Date) => {
  const start = normalizeDate(anchorDate);
  start.setDate(start.getDate() - 3);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

export default function Calendar() {
  const { isAuthenticated, isLoading } = useProtectedAdminPage();
  const { formatCurrency } = useAdminCurrency(isAuthenticated);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [calendarView, setCalendarView] = useState<CalendarView>('monthly');
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>([]);
  const [showMaintenance, setShowMaintenance] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchCalendarData = useCallback(async () => {
    try {
      const roomsSnapshot = await getDocs(collection(db, 'rooms'));
      const roomsData: Room[] = [];
      roomsSnapshot.forEach((docSnapshot) => {
        roomsData.push({ id: docSnapshot.id, ...docSnapshot.data() } as Room);
      });
      setAllRooms(Array.from(new Map(roomsData.map((room) => [getRoomName(room), room])).values()));

      const bookingsSnapshot = await getDocs(collection(db, 'bookings'));
      const bookingsData: Booking[] = [];
      bookingsSnapshot.forEach((docSnapshot) => {
        bookingsData.push({ id: docSnapshot.id, ...docSnapshot.data() } as Booking);
      });
      setAllBookings(bookingsData);

      const maintenanceSnapshot = await getDocs(collection(db, 'maintenance'));
      const maintenanceData: MaintenanceTask[] = [];
      maintenanceSnapshot.forEach((docSnapshot) => {
        maintenanceData.push({ id: docSnapshot.id, ...docSnapshot.data() } as MaintenanceTask);
      });
      setMaintenanceTasks(maintenanceData);
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      fetchCalendarData();
    }
  }, [fetchCalendarData, isAuthenticated, isLoading]);

  const activeBookings = useMemo(
    () => allBookings.filter(isActiveBooking),
    [allBookings]
  );

  const activeMaintenanceTasks = useMemo(
    () => maintenanceTasks.filter((task) => task.status !== 'completed'),
    [maintenanceTasks]
  );

  const roomNames = useMemo(() => {
    const names = new Set<string>();

    allRooms.forEach((room) => {
      const roomName = getRoomName(room);
      if (roomName) names.add(roomName);
    });

    activeBookings.forEach((booking) => {
      if (booking.room) names.add(booking.room);
    });

    activeMaintenanceTasks.forEach((task) => {
      if (task.room) names.add(task.room);
    });

    return Array.from(names).sort((left, right) => left.localeCompare(right));
  }, [activeBookings, activeMaintenanceTasks, allRooms]);

  const getDateSnapshot = (date: Date) => {
    const normalized = normalizeDate(date);

    const checkIns = activeBookings.filter((booking) =>
      datesAreSame(parseDateOnly(booking.checkIn), normalized)
    );

    const checkOuts = activeBookings.filter((booking) =>
      datesAreSame(parseDateOnly(booking.checkOut), normalized)
    );

    const occupiedBookings = activeBookings.filter((booking) => {
      const checkIn = parseDateOnly(booking.checkIn);
      const checkOut = parseDateOnly(booking.checkOut);
      if (!checkIn || !checkOut) return false;
      return checkIn.getTime() <= normalized.getTime() && checkOut.getTime() > normalized.getTime();
    });

    const maintenance = activeMaintenanceTasks.filter((task) => {
      const range = getMaintenanceDateRange(task);
      if (!range) return false;
      return normalized.getTime() >= range.start.getTime() && normalized.getTime() <= range.end.getTime();
    });

    const occupiedRoomNames = new Set(occupiedBookings.map((booking) => booking.room).filter(Boolean));
    const maintenanceRoomNames = new Set(maintenance.map((task) => task.room).filter(Boolean));
    const unavailableRoomNames = new Set([...occupiedRoomNames, ...maintenanceRoomNames]);
    const totalRooms = Math.max(roomNames.length, unavailableRoomNames.size);

    return {
      checkIns,
      checkOuts,
      occupiedBookings,
      ongoingStays: occupiedBookings.filter(
        (booking) =>
          !checkIns.some((checkIn) => checkIn.id === booking.id) &&
          !checkOuts.some((checkOut) => checkOut.id === booking.id)
      ),
      maintenance,
      occupiedRooms: occupiedRoomNames.size,
      maintenanceRooms: maintenanceRoomNames.size,
      totalRooms,
      availableRooms: Math.max(totalRooms - unavailableRoomNames.size, 0)
    };
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return {
      daysInMonth: lastDay.getDate(),
      startingDayOfWeek: firstDay.getDay()
    };
  };

  const shiftMonth = (offset: number) => {
    const nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
    setCurrentDate(nextDate);
    setSelectedDate(nextDate);
  };

  const handleCheckIn = async (booking: Booking) => {
    const result = await Swal.fire({
      title: 'Confirm Check-in',
      html: `<div class="text-left"><p><strong>${getGuestName(booking)}</strong></p><p>Room: ${booking.room}</p><p>Guests: ${booking.guests || 1}</p></div>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, Check In',
      cancelButtonText: 'Cancel'
    });

    if (result.isConfirmed) {
      try {
        setIsProcessing(true);
        await updateDoc(doc(db, 'bookings', booking.id), {
          status: 'in-progress',
          checkInTime: Timestamp.now(),
          updatedAt: Timestamp.now()
        });

        setAllBookings((prev) =>
          prev.map((item) => item.id === booking.id ? { ...item, status: 'in-progress' } : item)
        );

        Swal.fire({
          title: 'Success!',
          text: `${getGuestName(booking)} has checked in to Room ${booking.room}`,
          icon: 'success',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      } catch (error) {
        console.error('Error checking in:', error);
        Swal.fire({
          title: 'Error',
          text: 'Failed to check in guest. Please try again.',
          icon: 'error'
        });
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleCheckOut = async (booking: Booking) => {
    const result = await Swal.fire({
      title: 'Confirm Check-out',
      html: `<div class="text-left"><p><strong>${getGuestName(booking)}</strong></p><p>Room: ${booking.room}</p><p>Total Amount: ${formatCurrency(getBookingTotal(booking) ?? 0)}</p></div>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, Check Out',
      cancelButtonText: 'Cancel'
    });

    if (result.isConfirmed) {
      try {
        setIsProcessing(true);
        await updateDoc(doc(db, 'bookings', booking.id), {
          status: 'completed',
          checkOutTime: Timestamp.now(),
          updatedAt: Timestamp.now()
        });

        setAllBookings((prev) =>
          prev.map((item) => item.id === booking.id ? { ...item, status: 'completed' } : item)
        );

        Swal.fire({
          title: 'Success!',
          text: `${getGuestName(booking)} has checked out from Room ${booking.room}`,
          icon: 'success',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      } catch (error) {
        console.error('Error checking out:', error);
        Swal.fire({
          title: 'Error',
          text: 'Failed to check out guest. Please try again.',
          icon: 'error'
        });
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleMaintenanceComplete = async (task: MaintenanceTask) => {
    const result = await Swal.fire({
      title: 'Complete Maintenance Task',
      html: `<div class="text-left"><p><strong>${task.title}</strong></p><p>Room: ${task.room}</p><p>Priority: ${task.priority}</p></div>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#fbbf24',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, Complete',
      cancelButtonText: 'Cancel'
    });

    if (result.isConfirmed) {
      try {
        setIsProcessing(true);
        await updateDoc(doc(db, 'maintenance', task.id), {
          status: 'completed',
          completedAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });

        setMaintenanceTasks((prev) =>
          prev.map((item) => item.id === task.id ? { ...item, status: 'completed' } : item)
        );

        Swal.fire({
          title: 'Success!',
          text: `Maintenance task "${task.title}" has been marked as complete`,
          icon: 'success',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      } catch (error) {
        console.error('Error completing maintenance:', error);
        Swal.fire({
          title: 'Error',
          text: 'Failed to complete maintenance task. Please try again.',
          icon: 'error'
        });
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const renderSummaryMetric = (label: string, value: number | string, colorClassName: string) => (
    <div className={`flex flex-col justify-center rounded-lg border p-3 ${colorClassName}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );

  const renderCalendarLegend = () => (
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-gray-100 bg-gray-50/80 px-4 py-3 text-sm dark:border-gray-800 dark:bg-gray-800/50">
      <span className="font-bold text-gray-700 dark:text-gray-300">Legend:</span>
      {calendarLegendItems.map((item) => (
        <div
          key={item.colorName}
          className="flex items-center gap-1.5"
          title={item.description}
        >
          <span className={`h-3 w-3 rounded-full ${item.swatchClassName} shadow-sm`}></span>
          <span className="font-medium text-gray-600 dark:text-gray-400">{item.meaning}</span>
        </div>
      ))}
    </div>
  );

  const renderBookingCard = (booking: Booking, type: BookingCardType) => {
    const total = getBookingTotal(booking);
    const nights = getNightCount(booking);
    const isCheckIn = type === 'check-in';
    const isCheckOut = type === 'check-out';
    const isOngoing = type === 'ongoing';
    const tone = isOngoing
      ? {
          card: 'border-blue-100 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-900/10',
          badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300',
          label: 'Currently Staying'
        }
      : {
          card: 'border-orange-100 bg-orange-50/50 dark:border-orange-900/40 dark:bg-orange-900/10',
          badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300',
          label: isCheckIn ? 'Check-in Today' : 'Check-out Today'
        };

    return (
      <div key={`${type}-${booking.id}`} className={`rounded-xl border p-4 transition hover:shadow-sm ${tone.card}`}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h4 className="text-base font-bold text-gray-900 dark:text-white">{getGuestName(booking)}</h4>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">Room {booking.room || 'Unassigned'}</p>
          </div>
          <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${tone.badge}`}>
            {tone.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-white/60 p-2 dark:bg-gray-800/60 border border-white dark:border-gray-700">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Stay</span>
            <span className="mt-0.5 block font-semibold text-gray-800 dark:text-gray-200">{formatStayRange(booking)}</span>
          </div>
          <div className="rounded-lg bg-white/60 p-2 dark:bg-gray-800/60 border border-white dark:border-gray-700">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Duration</span>
            <span className="mt-0.5 block font-semibold text-gray-800 dark:text-gray-200">{nights ? `${nights} night(s)` : 'Not set'}</span>
          </div>
        </div>

        {(booking.email || booking.phone || booking.mobile || total !== null) && (
          <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              {booking.email && (
                <a
                  href={`mailto:${booking.email}`}
                  className="truncate text-blue-600 hover:underline dark:text-blue-400"
                >
                  {booking.email}
                </a>
              )}
              {(booking.phone || booking.mobile) && (
                <a
                  href={`tel:${booking.phone || booking.mobile}`}
                  className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  {booking.phone || booking.mobile}
                </a>
              )}
            </div>
            {total !== null && (
              <div className="flex flex-col items-start sm:items-end justify-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Total</span>
                <span className="font-bold text-green-600 dark:text-green-400">{formatCurrency(total)}</span>
              </div>
            )}
          </div>
        )}

        {isCheckIn && (
          <button
            type="button"
            onClick={() => handleCheckIn(booking)}
            disabled={isProcessing || booking.status === 'in-progress'}
            className={`mt-4 w-full rounded-lg px-3 py-2 text-sm font-bold shadow-sm transition-all ${
              booking.status === 'in-progress'
                ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
                : isProcessing
                  ? 'cursor-not-allowed bg-blue-400 text-white opacity-70'
                  : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md'
            }`}
          >
            {isProcessing ? 'Processing...' : booking.status === 'in-progress' ? 'Checked In' : 'Check In Guest'}
          </button>
        )}

        {isCheckOut && (
          <button
            type="button"
            onClick={() => handleCheckOut(booking)}
            disabled={isProcessing || booking.status === 'completed'}
            className={`mt-4 w-full rounded-lg px-3 py-2 text-sm font-bold shadow-sm transition-all ${
              booking.status === 'completed'
                ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
                : isProcessing
                  ? 'cursor-not-allowed bg-orange-400 text-white opacity-70'
                  : 'bg-orange-500 text-white hover:bg-orange-600 hover:shadow-md'
            }`}
          >
            {isProcessing ? 'Processing...' : booking.status === 'completed' ? 'Checked Out' : 'Check Out Guest'}
          </button>
        )}
      </div>
    );
  };

  const renderMaintenanceCard = (task: MaintenanceTask) => (
    <div key={task.id} className="rounded-xl border border-yellow-200 bg-yellow-50/80 p-4 transition hover:shadow-sm dark:border-yellow-900/50 dark:bg-yellow-900/10">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h4 className="text-base font-bold text-gray-900 dark:text-white">{task.title}</h4>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">Room {task.room || 'Unassigned'}</p>
        </div>
        <span className="shrink-0 rounded-md bg-yellow-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-300">
          {formatStatusLabel(task.priority)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white/60 p-2 dark:bg-gray-800/60 border border-white dark:border-gray-700">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Window</span>
          <span className="mt-0.5 block font-semibold text-gray-800 dark:text-gray-200">
            {formatStoredDate(task.startDate || task.dueDate)} - {formatStoredDate(task.dueDate || task.startDate)}
          </span>
        </div>
        <div className="rounded-lg bg-white/60 p-2 dark:bg-gray-800/60 border border-white dark:border-gray-700">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Status</span>
          <span className="mt-0.5 block font-semibold text-gray-800 dark:text-gray-200">{formatStatusLabel(task.status)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => handleMaintenanceComplete(task)}
        disabled={isProcessing || task.status === 'completed'}
        className={`mt-4 w-full rounded-lg px-3 py-2 text-sm font-bold shadow-sm transition-all ${
          task.status === 'completed'
            ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
            : isProcessing
              ? 'cursor-not-allowed bg-yellow-400 text-white opacity-70'
              : 'bg-yellow-500 text-white hover:bg-yellow-600 hover:shadow-md'
        }`}
      >
        {isProcessing ? 'Processing...' : task.status === 'completed' ? 'Completed' : 'Mark Complete'}
      </button>
    </div>
  );

  const getRoomTimelineState = (roomName: string, date: Date) => {
    const snapshot = getDateSnapshot(date);
    const maintenance = showMaintenance
      ? snapshot.maintenance.find((task) => roomMatches(roomName, task.room))
      : undefined;
    const checkIn = snapshot.checkIns.find((booking) => roomMatches(roomName, booking.room));
    const checkOut = snapshot.checkOuts.find((booking) => roomMatches(roomName, booking.room));
    const occupied = snapshot.occupiedBookings.find((booking) => roomMatches(roomName, booking.room));

    if (maintenance) {
      return {
        label: 'Maintenance',
        detail: maintenance.title,
        className: 'border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200'
      };
    }

    if (checkIn && checkOut) {
      return {
        label: 'Turnover',
        detail: getGuestName(checkIn),
        className: 'border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-900/30 dark:text-orange-200'
      };
    }

    if (checkIn) {
      return {
        label: 'Check-in',
        detail: getGuestName(checkIn),
        className: 'border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-900/30 dark:text-orange-200'
      };
    }

    if (checkOut) {
      return {
        label: 'Check-out',
        detail: getGuestName(checkOut),
        className: 'border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-900/30 dark:text-orange-200'
      };
    }

    if (occupied) {
      return {
        label: 'Occupied',
        detail: getGuestName(occupied),
        className: 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
      };
    }

    return {
      label: 'Available',
      detail: '',
      className: 'border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-900/20 dark:text-green-200'
    };
  };

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: '#1a3a52' }}>
        <div className="text-xl text-white">Loading...</div>
      </div>
    );
  }

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate);
  const todaySnapshot = getDateSnapshot(new Date());
  const selectedSnapshot = getDateSnapshot(selectedDate);
  const timelineDays = getTimelineDays(selectedDate);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <Header />

      <AdminMainContent>
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="admin-page-header">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">Calendar</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage monthly occupancy and room-level availability</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowMaintenance((value) => !value)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors ${
                showMaintenance
                  ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'
              }`}
            >
              {showMaintenance ? 'Maintenance: Visible' : 'Maintenance: Hidden'}
            </button>

            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => setCalendarView('monthly')}
                className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-all ${
                  calendarView === 'monthly'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setCalendarView('timeline')}
                className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-all ${
                  calendarView === 'timeline'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                Timeline
              </button>
            </div>
          </div>
        </div>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="flex flex-col justify-center rounded-xl border border-blue-100 bg-blue-50/30 p-5 shadow-sm dark:border-blue-900/30 dark:bg-blue-900/10">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Occupied</p>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <p className="text-3xl font-black text-gray-900 dark:text-white">{todaySnapshot.occupiedRooms}</p>
                <p className="text-sm font-semibold text-gray-500">/ {todaySnapshot.totalRooms}</p>
              </div>
            </div>
            <div className="flex flex-col justify-center rounded-xl border border-green-100 bg-green-50/30 p-5 shadow-sm dark:border-green-900/30 dark:bg-green-900/10">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Available</p>
              </div>
              <p className="mt-2 text-3xl font-black text-gray-900 dark:text-white">{todaySnapshot.availableRooms}</p>
            </div>
            <div className="flex flex-col justify-center rounded-xl border border-orange-100 bg-orange-50/30 p-5 shadow-sm dark:border-orange-900/30 dark:bg-orange-900/10">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-orange-500"></span>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Check-ins Today</p>
              </div>
              <p className="mt-2 text-3xl font-black text-gray-900 dark:text-white">{todaySnapshot.checkIns.length}</p>
            </div>
            <div className="flex flex-col justify-center rounded-xl border border-orange-100 bg-orange-50/30 p-5 shadow-sm dark:border-orange-900/30 dark:bg-orange-900/10">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-orange-500"></span>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Check-outs Today</p>
              </div>
              <p className="mt-2 text-3xl font-black text-gray-900 dark:text-white">{todaySnapshot.checkOuts.length}</p>
            </div>
            <div className="flex flex-col justify-center rounded-xl border border-yellow-100 bg-yellow-50/30 p-5 shadow-sm dark:border-yellow-900/30 dark:bg-yellow-900/10">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-yellow-500"></span>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Maintenance</p>
              </div>
              <p className="mt-2 text-3xl font-black text-gray-900 dark:text-white">{todaySnapshot.maintenance.length}</p>
            </div>
          </div>

        {calendarView === 'monthly' ? (
          <div className="flex flex-col items-start gap-6 xl:flex-row">
            <div className="w-full xl:w-2/3 2xl:w-3/4">
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => shiftMonth(-1)}
                      className="rounded-lg p-2 transition hover:bg-gray-100 dark:hover:bg-gray-700"
                      aria-label="Previous month"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const today = new Date();
                        setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
                        setSelectedDate(today);
                      }}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => shiftMonth(1)}
                      className="rounded-lg p-2 transition hover:bg-gray-100 dark:hover:bg-gray-700"
                      aria-label="Next month"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>

                {renderCalendarLegend()}

                <div className="overflow-x-auto pb-2">
                  <div className="min-w-[760px]">
                    <div className="mb-3 grid grid-cols-7 gap-2">
                      {dayNames.map((day) => (
                        <div key={day} className="py-2 text-center text-xs font-semibold text-gray-600 dark:text-gray-400">
                          {day}
                        </div>
                      ))}

                      {Array.from({ length: startingDayOfWeek }).map((_, index) => (
                        <div key={`empty-${index}`} className="min-h-[104px] rounded-lg border border-transparent"></div>
                      ))}

                      {Array.from({ length: daysInMonth }).map((_, index) => {
                        const day = index + 1;
                        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                        const snapshot = getDateSnapshot(date);
                        const isToday = datesAreSame(normalizeDate(new Date()), date);
                        const isSelected = datesAreSame(selectedDate, date);
                        const isFullyBooked = snapshot.totalRooms > 0 && snapshot.availableRooms === 0;
                        const hasMaintenance = showMaintenance && snapshot.maintenance.length > 0;
                        const tileStatus = isFullyBooked
                          ? 'Full'
                          : hasMaintenance
                            ? 'Maintenance'
                            : snapshot.occupiedRooms > 0
                              ? 'Occupied'
                              : 'Available';
                        const hasTurnover = snapshot.checkIns.length > 0 || snapshot.checkOuts.length > 0;
                        const baseColorClass = isFullyBooked
                          ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-900/20 dark:text-red-200'
                          : hasMaintenance
                            ? 'border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200'
                            : snapshot.occupiedRooms > 0
                              ? 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-200'
                              : 'border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-900/20 dark:text-green-200';

                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => setSelectedDate(date)}
                            aria-label={`${formatFullDate(date)}: ${tileStatus}, ${snapshot.occupiedRooms} occupied, ${snapshot.availableRooms} available, ${snapshot.checkIns.length} check-ins, ${snapshot.checkOuts.length} check-outs, ${snapshot.maintenance.length} maintenance`}
                            className={`relative flex min-h-[104px] flex-col rounded-lg border p-2 text-left transition hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isSelected ? 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-gray-900' : ''
                            } ${baseColorClass}`}
                          >
                            {hasMaintenance && (
                              <span className="absolute left-2 right-2 top-1 h-1 rounded-full bg-yellow-500"></span>
                            )}
                            <div className="flex items-start justify-between gap-2 pt-1">
                              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                                isToday ? 'bg-blue-600 text-white' : ''
                              }`}>
                                {day}
                              </span>
                              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-bold uppercase leading-tight shadow-sm dark:bg-gray-900/40">
                                {tileStatus}
                              </span>
                            </div>

                            <div className="mt-3 flex flex-1 flex-col justify-center gap-1 text-center text-[11px] font-semibold leading-tight">
                              <span>{snapshot.occupiedRooms} occupied</span>
                              <span>{snapshot.availableRooms} available</span>
                            </div>

                            <div className="mt-auto flex min-h-5 flex-wrap items-center justify-center gap-1 pt-2">
                              {hasTurnover && (
                                <>
                                  {snapshot.checkIns.length > 0 && (
                                    <span
                                      className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white"
                                      title={`${snapshot.checkIns.length} check-in(s)`}
                                    >
                                      CI {snapshot.checkIns.length}
                                    </span>
                                  )}
                                  {snapshot.checkOuts.length > 0 && (
                                    <span
                                      className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white"
                                      title={`${snapshot.checkOuts.length} check-out(s)`}
                                    >
                                      CO {snapshot.checkOuts.length}
                                    </span>
                                  )}
                                </>
                              )}
                              {hasMaintenance && (
                                <span
                                  className="rounded-full bg-yellow-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-yellow-950"
                                  title={`${snapshot.maintenance.length} maintenance task(s)`}
                                >
                                  M {snapshot.maintenance.length}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

              </div>
            </div>

            <div className="w-full xl:w-1/3 2xl:w-1/4 xl:sticky xl:top-6">
              <div className="flex max-h-[calc(100vh-6rem)] flex-col rounded-xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="border-b border-gray-100 p-5 dark:border-gray-800 shrink-0">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Room Status for {formatFullDate(selectedDate)}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{dayNames[selectedDate.getDay()]}</p>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
                  <div className="mb-6">
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Summary</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {renderSummaryMetric('Occupied', selectedSnapshot.occupiedRooms, 'border-blue-100 bg-blue-50/50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/10 dark:text-blue-300')}
                      {renderSummaryMetric('Available', selectedSnapshot.availableRooms, 'border-green-100 bg-green-50/50 text-green-700 dark:border-green-900/40 dark:bg-green-900/10 dark:text-green-300')}
                      {renderSummaryMetric('Check-ins', selectedSnapshot.checkIns.length, 'border-orange-100 bg-orange-50/50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-900/10 dark:text-orange-300')}
                      {renderSummaryMetric('Check-outs', selectedSnapshot.checkOuts.length, 'border-orange-100 bg-orange-50/50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-900/10 dark:text-orange-300')}
                    </div>
                    {selectedSnapshot.maintenance.length > 0 && (
                      <div className="mt-2">
                        {renderSummaryMetric('Maintenance', selectedSnapshot.maintenance.length, 'border-yellow-100 bg-yellow-50/50 text-yellow-700 dark:border-yellow-900/40 dark:bg-yellow-900/10 dark:text-yellow-300')}
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    <section>
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                        Ongoing Stays ({selectedSnapshot.ongoingStays.length})
                      </h3>
                      <div className="space-y-3">
                        {selectedSnapshot.ongoingStays.length > 0
                          ? selectedSnapshot.ongoingStays.map((booking) => renderBookingCard(booking, 'ongoing'))
                          : <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">No ongoing stays for this date.</p>}
                      </div>
                    </section>

                    {selectedSnapshot.checkIns.length > 0 && (
                      <section>
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          <span className="h-2 w-2 rounded-full bg-orange-500"></span>
                          Check-ins ({selectedSnapshot.checkIns.length})
                        </h3>
                        <div className="space-y-3">
                          {selectedSnapshot.checkIns.map((booking) => renderBookingCard(booking, 'check-in'))}
                        </div>
                      </section>
                    )}

                    {selectedSnapshot.checkOuts.length > 0 && (
                      <section>
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          <span className="h-2 w-2 rounded-full bg-orange-500"></span>
                          Check-outs ({selectedSnapshot.checkOuts.length})
                        </h3>
                        <div className="space-y-3">
                          {selectedSnapshot.checkOuts.map((booking) => renderBookingCard(booking, 'check-out'))}
                        </div>
                      </section>
                    )}

                    {showMaintenance && selectedSnapshot.maintenance.length > 0 && (
                      <section>
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          <span className="h-2 w-2 rounded-full bg-yellow-500"></span>
                          Maintenance ({selectedSnapshot.maintenance.length})
                        </h3>
                        <div className="space-y-3">
                          {selectedSnapshot.maintenance.map(renderMaintenanceCard)}
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Room Timeline</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {formatShortDate(timelineDays[0])} - {formatShortDate(timelineDays[timelineDays.length - 1])}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const previous = new Date(selectedDate);
                    previous.setDate(previous.getDate() - 7);
                    setSelectedDate(previous);
                    setCurrentDate(new Date(previous.getFullYear(), previous.getMonth(), 1));
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Previous 7 Days
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    setSelectedDate(today);
                    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = new Date(selectedDate);
                    next.setDate(next.getDate() + 7);
                    setSelectedDate(next);
                    setCurrentDate(new Date(next.getFullYear(), next.getMonth(), 1));
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Next 7 Days
                </button>
              </div>
            </div>

            {renderCalendarLegend()}

            {roomNames.length > 0 ? (
              <div className="overflow-x-auto">
                <div className="min-w-[920px]">
                  <div
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `180px repeat(${timelineDays.length}, minmax(96px, 1fr))` }}
                  >
                    <div className="rounded-lg bg-gray-100 p-3 text-sm font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                      Room
                    </div>
                    {timelineDays.map((date) => {
                      const isSelected = datesAreSame(selectedDate, date);
                      return (
                        <button
                          key={date.toISOString()}
                          type="button"
                          onClick={() => {
                            setSelectedDate(date);
                            setCurrentDate(new Date(date.getFullYear(), date.getMonth(), 1));
                          }}
                          className={`rounded-lg p-3 text-center text-sm font-semibold transition ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          <span className="block">{dayNames[date.getDay()]}</span>
                          <span className="block text-xs opacity-80">{formatShortDate(date)}</span>
                        </button>
                      );
                    })}

                    {roomNames.map((roomName) => (
                      <div key={roomName} className="contents">
                        <div className="flex min-h-[70px] items-center rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:bg-gray-700/50 dark:text-white">
                          {roomName}
                        </div>
                        {timelineDays.map((date) => {
                          const state = getRoomTimelineState(roomName, date);
                          return (
                            <button
                              key={`${roomName}-${date.toISOString()}`}
                              type="button"
                              onClick={() => {
                                setSelectedDate(date);
                                setCurrentDate(new Date(date.getFullYear(), date.getMonth(), 1));
                              }}
                              className={`min-h-[70px] rounded-lg border p-2 text-left transition hover:shadow-sm ${state.className}`}
                              aria-label={`${roomName} ${formatFullDate(date)} ${state.label}`}
                            >
                              <span className="block text-xs font-bold uppercase tracking-wide">{state.label}</span>
                              {state.detail && (
                                <span className="mt-1 block truncate text-xs opacity-80">{state.detail}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No rooms configured.
              </div>
            )}
          </div>
        )}
      </AdminMainContent>
    </div>
  );
}
