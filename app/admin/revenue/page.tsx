"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from 'react';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminMainContent from '../components/AdminMainContent';
import { useAdminCurrency } from '../hooks/useAdminCurrency';
import { db } from '@/lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';

type DateGranularity = 'all' | 'year' | 'month' | 'week' | 'day';
type DateBasis = 'checkIn' | 'createdAt';

type DateLike = string | Date | { toDate: () => Date } | { seconds: number; nanoseconds?: number };

type BookingPayment = {
  total?: number | string;
  basePrice?: number | string;
  extraFee?: number | string;
  subtotal?: number | string;
  couponDiscount?: number | string;
  nights?: number | string;
};

type RevenueBooking = {
  id: string;
  name?: string;
  surname?: string;
  email?: string;
  status?: string;
  payment?: BookingPayment;
  totalPrice?: number | string;
  totalAmount?: number | string;
  createdAt: Date;
  checkIn?: DateLike;
  checkOut?: DateLike;
  room?: string;
  guests?: number | string;
  nights?: number | string;
  coupon?: {
    applied?: boolean;
    id?: string;
    title?: string;
    discountPercent?: number;
  };
};

type DateRange = {
  start: Date;
  end: Date;
  label: string;
};

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const monthShortNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatStatusLabel = (status?: string) => {
  if (status === 'in-progress') return 'In-House';

  return (status || 'unknown')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

function parseNumber(value: number | string | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseDateValue(value: DateLike | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const parsed = value.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') {
    const parsed = new Date(value.seconds * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'string') {
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnlyMatch) {
      const parsed = new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatRangeLabel(start: Date, end: Date) {
  if (start.toDateString() === end.toDateString()) {
    return formatDisplayDate(start);
  }
  return `${formatDisplayDate(start)} - ${formatDisplayDate(end)}`;
}

function getMonthWeeks(year: number, monthIndex: number) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const weeks: DateRange[] = [];
  for (let startDay = 1; startDay <= lastDay; startDay += 7) {
    const endDay = Math.min(startDay + 6, lastDay);
    const start = startOfDay(new Date(year, monthIndex, startDay));
    const end = endOfDay(new Date(year, monthIndex, endDay));
    weeks.push({
      start,
      end,
      label: `Week ${weeks.length + 1}: ${formatRangeLabel(start, end)}`,
    });
  }
  return weeks;
}

function getBookingRevenue(booking: RevenueBooking) {
  return parseNumber(booking.payment?.total) || parseNumber(booking.totalPrice) || parseNumber(booking.totalAmount);
}

function getBookingNights(booking: RevenueBooking) {
  return parseNumber(booking.payment?.nights) || parseNumber(booking.nights);
}

function getBookingDate(booking: RevenueBooking, basis: DateBasis) {
  if (basis === 'checkIn') {
    return parseDateValue(booking.checkIn) || booking.createdAt;
  }
  return booking.createdAt;
}

function isWithinRange(date: Date, range: DateRange) {
  const time = startOfDay(date).getTime();
  return time >= startOfDay(range.start).getTime() && time <= startOfDay(range.end).getTime();
}

export default function Revenue() {
  const { isAuthenticated } = useProtectedAdminPage();
  const { formatCurrency } = useAdminCurrency(isAuthenticated);
  const today = useMemo(() => new Date(), []);
  const [allBookings, setAllBookings] = useState<RevenueBooking[]>([]);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState(formatDateInput(today));
  const [granularity, setGranularity] = useState<DateGranularity>('month');
  const [dateBasis, setDateBasis] = useState<DateBasis>('checkIn');

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const bookingsQuery = query(collection(db, 'bookings'));
    const unsubscribe = onSnapshot(bookingsQuery, (snapshot) => {
      const bookings: RevenueBooking[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status === 'confirmed' || data.status === 'in-progress' || data.status === 'completed') {
          const createdAtValue = parseDateValue(data.createdAt) || new Date();
          bookings.push({
            id: doc.id,
            name: data.name,
            surname: data.surname,
            email: data.email,
            status: data.status,
            payment: data.payment,
            totalPrice: data.totalPrice,
            totalAmount: data.totalAmount,
            createdAt: createdAtValue,
            checkIn: data.checkIn,
            checkOut: data.checkOut,
            room: data.room,
            guests: data.guests,
            nights: data.nights,
            coupon: data.coupon,
          });
        }
      });

      setAllBookings(bookings);
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    allBookings.forEach((booking) => {
      years.add(booking.createdAt.getFullYear());
      const checkIn = parseDateValue(booking.checkIn);
      if (checkIn) years.add(checkIn.getFullYear());
    });
    years.add(today.getFullYear());
    years.add(today.getFullYear() - 1);
    return Array.from(years).sort((a, b) => b - a);
  }, [allBookings, today]);

  const weekOptions = useMemo(() => getMonthWeeks(selectedYear, selectedMonth), [selectedMonth, selectedYear]);
  const activeWeekIndex = weekOptions[selectedWeekIndex] ? selectedWeekIndex : 0;

  const activeRange = useMemo<DateRange | null>(() => {
    if (granularity === 'all') return null;
    if (granularity === 'year') {
      const start = startOfDay(new Date(selectedYear, 0, 1));
      const end = endOfDay(new Date(selectedYear, 11, 31));
      return { start, end, label: `${selectedYear}` };
    }
    if (granularity === 'month') {
      const start = startOfDay(new Date(selectedYear, selectedMonth, 1));
      const end = endOfDay(new Date(selectedYear, selectedMonth + 1, 0));
      return { start, end, label: `${months[selectedMonth]} ${selectedYear}` };
    }
    if (granularity === 'week') {
      return weekOptions[activeWeekIndex] || null;
    }
    const parsedDate = parseDateValue(selectedDate);
    const safeDate = parsedDate || today;
    return {
      start: startOfDay(safeDate),
      end: endOfDay(safeDate),
      label: formatDisplayDate(safeDate),
    };
  }, [activeWeekIndex, granularity, selectedDate, selectedMonth, selectedYear, today, weekOptions]);

  const filteredBookings = useMemo(() => {
    const sorted = [...allBookings].sort(
      (a, b) => getBookingDate(b, dateBasis).getTime() - getBookingDate(a, dateBasis).getTime()
    );
    if (!activeRange) return sorted;
    return sorted.filter((booking) => isWithinRange(getBookingDate(booking, dateBasis), activeRange));
  }, [activeRange, allBookings, dateBasis]);

  const totalRevenue = useMemo(() => {
    return filteredBookings.reduce((sum, booking) => sum + getBookingRevenue(booking), 0);
  }, [filteredBookings]);

  const totalNights = useMemo(() => {
    return filteredBookings.reduce((sum, booking) => sum + getBookingNights(booking), 0);
  }, [filteredBookings]);

  const totalDiscount = useMemo(() => {
    return filteredBookings.reduce((sum, booking) => sum + parseNumber(booking.payment?.couponDiscount), 0);
  }, [filteredBookings]);

  const breakdown = useMemo(() => {
    const makeBucket = (label: string, start: Date, end: Date) => {
      const bookings = filteredBookings.filter((booking) => isWithinRange(getBookingDate(booking, dateBasis), { start, end, label }));
      const total = bookings.reduce((sum, booking) => sum + getBookingRevenue(booking), 0);
      return { label, start, end, bookings, total };
    };

    if (granularity === 'all') {
      return availableYears
        .slice()
        .sort((a, b) => b - a)
        .map((year) => makeBucket(String(year), startOfDay(new Date(year, 0, 1)), endOfDay(new Date(year, 11, 31))));
    }

    if (granularity === 'year') {
      return months.map((month, index) =>
        makeBucket(month, startOfDay(new Date(selectedYear, index, 1)), endOfDay(new Date(selectedYear, index + 1, 0)))
      );
    }

    if (granularity === 'month') {
      const days = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      return Array.from({ length: days }, (_, index) => {
        const day = index + 1;
        const date = new Date(selectedYear, selectedMonth, day);
        return makeBucket(`${monthShortNames[selectedMonth]} ${day}`, startOfDay(date), endOfDay(date));
      });
    }

    if (granularity === 'week' && activeRange) {
      const days: Date[] = [];
      const cursor = startOfDay(activeRange.start);
      while (cursor.getTime() <= startOfDay(activeRange.end).getTime()) {
        days.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      return days.map((date) => makeBucket(formatDisplayDate(date), startOfDay(date), endOfDay(date)));
    }

    return filteredBookings.map((booking) => {
      const date = getBookingDate(booking, dateBasis);
      return {
        label: `${booking.room || 'Room'} - ${booking.name || 'Guest'} ${booking.surname || ''}`.trim(),
        start: startOfDay(date),
        end: endOfDay(date),
        bookings: [booking],
        total: getBookingRevenue(booking),
      };
    });
  }, [activeRange, availableYears, dateBasis, filteredBookings, granularity, selectedMonth, selectedYear]);

  const maxBreakdownTotal = Math.max(...breakdown.map((item) => item.total), 1);
  const revenueBookingCount = filteredBookings.length;
  const averageRevenue = revenueBookingCount > 0 ? totalRevenue / revenueBookingCount : 0;
  const rangeLabel = activeRange?.label || 'All time';

  const handleMonthChange = (monthIndex: number) => {
    setSelectedMonth(monthIndex);
    setSelectedWeekIndex(0);
  };

  const handleWeekChange = (weekIndex: number) => {
    setSelectedWeekIndex(weekIndex);
    setGranularity('week');
  };

  const handleDateChange = (value: string) => {
    setSelectedDate(value);
    const parsedDate = parseDateValue(value);
    if (parsedDate) {
      setSelectedYear(parsedDate.getFullYear());
      setSelectedMonth(parsedDate.getMonth());
    }
    setGranularity('day');
  };

  const handleExportCSV = () => {
    const headers = [
      'Booking ID',
      'Guest',
      'Room',
      'Status',
      'Revenue Date',
      'Check-in Date',
      'Check-out Date',
      'Guests',
      'Nights',
      'Base Price',
      'Extra Fee',
      'Coupon',
      'Coupon Discount',
      'Total Revenue',
      'Record Created',
    ];

    const rows = filteredBookings.map((booking) => {
      const revenueDate = getBookingDate(booking, dateBasis);
      const checkIn = parseDateValue(booking.checkIn);
      const checkOut = parseDateValue(booking.checkOut);
      return [
        booking.id,
        `${booking.name || ''} ${booking.surname || ''}`.trim(),
        booking.room || '',
        booking.status || '',
        formatDisplayDate(revenueDate),
        checkIn ? formatDisplayDate(checkIn) : '',
        checkOut ? formatDisplayDate(checkOut) : '',
        booking.guests || '',
        getBookingNights(booking) || '',
        booking.payment?.basePrice || '',
        booking.payment?.extraFee || '0',
        booking.coupon?.applied ? `${booking.coupon.title || booking.coupon.id || ''} (${booking.coupon.discountPercent || 0}% OFF)` : '',
        booking.payment?.couponDiscount || '0',
        getBookingRevenue(booking),
        `${booking.createdAt.toLocaleDateString()} ${booking.createdAt.toLocaleTimeString()}`,
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => {
        const cellStr = String(cell);
        return /[",\n]/.test(cellStr) ? `"${cellStr.replace(/"/g, '""')}"` : cellStr;
      }).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().split('T')[0];
    const reportName = rangeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'all-time';

    link.setAttribute('href', url);
    link.setAttribute('download', `revenue-report-${reportName}-${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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
        <div className="admin-page-header mb-6">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            Revenue
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
            Filter and audit revenue-generating booking records
          </p>
        </div>

        <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Revenue Filter</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Currently viewing: <span className="font-semibold text-blue-600 dark:text-blue-400">{rangeLabel}</span></p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export CSV Report
                </button>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex flex-wrap items-end gap-4">
                <label className="block w-40">
                  <span className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">View By</span>
                  <select
                    value={granularity}
                    onChange={(e) => setGranularity(e.target.value as DateGranularity)}
                    className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-shadow"
                  >
                    <option value="all">All Time</option>
                    <option value="year">Yearly</option>
                    <option value="month">Monthly</option>
                    <option value="week">Weekly</option>
                    <option value="day">Specific Day</option>
                  </select>
                </label>

                {granularity !== 'all' && granularity !== 'day' && (
                  <label className="block w-32">
                    <span className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Year</span>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-shadow"
                    >
                      {availableYears.map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </label>
                )}

                {(granularity === 'month' || granularity === 'week') && (
                  <label className="block w-40">
                    <span className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Month</span>
                    <select
                      value={selectedMonth}
                      onChange={(e) => handleMonthChange(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-shadow"
                    >
                      {months.map((month, index) => (
                        <option key={month} value={index}>{month}</option>
                      ))}
                    </select>
                  </label>
                )}

                {granularity === 'week' && (
                  <label className="block w-64">
                    <span className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Week</span>
                    <select
                      value={activeWeekIndex}
                      onChange={(e) => handleWeekChange(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-shadow"
                    >
                      {weekOptions.map((week, index) => (
                        <option key={week.label} value={index}>{week.label}</option>
                      ))}
                    </select>
                  </label>
                )}

                {granularity === 'day' && (
                  <label className="block w-48">
                    <span className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Exact Date</span>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-shadow"
                    />
                  </label>
                )}

                <div className="flex-1"></div>

                <label className="block w-48">
                  <span className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Tracking Basis</span>
                  <select
                    value={dateBasis}
                    onChange={(event) => setDateBasis(event.target.value as DateBasis)}
                    className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-shadow"
                  >
                    <option value="checkIn">Check-in Date</option>
                    <option value="createdAt">Record Creation Date</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Revenue</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-3">
              {formatCurrency(totalRevenue, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{rangeLabel}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Revenue Bookings</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-3">{revenueBookingCount}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Confirmed, In-House, and completed records</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Average per Booking</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-3">
              {formatCurrency(averageRevenue, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Filtered period average</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Nights / Discounts</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-3">{totalNights}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {formatCurrency(totalDiscount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} discount tracked
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Period Breakdown</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Revenue grouped by the active view</p>
              </div>
            </div>

            <div className="space-y-3 max-h-[34rem] overflow-y-auto pr-1">
              {breakdown.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No breakdown available.</p>
              ) : (
                breakdown.map((item) => (
                  <div key={`${item.label}-${item.start.toISOString()}`} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {item.bookings.length} booking{item.bookings.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">
                        {formatCurrency(item.total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500"
                        style={{ width: `${Math.max(3, Math.round((item.total / maxBreakdownTotal) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Revenue Records</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Detailed bookings for {rangeLabel}</p>
              </div>
              <span className="px-3 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-semibold">
                {filteredBookings.length} records
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Guest</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Room</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Stay</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredBookings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                        No revenue records found for this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredBookings.map((booking) => {
                      const checkIn = parseDateValue(booking.checkIn);
                      const checkOut = parseDateValue(booking.checkOut);
                      return (
                        <tr key={booking.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                            {formatDisplayDate(getBookingDate(booking, dateBasis))}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                            <div className="font-medium">{`${booking.name || ''} ${booking.surname || ''}`.trim() || 'Guest'}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{booking.email || booking.id}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                            {booking.room || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                            {checkIn && checkOut ? `${formatDisplayDate(checkIn)} - ${formatDisplayDate(checkOut)}` : '-'}
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {getBookingNights(booking)} night{getBookingNights(booking) === 1 ? '' : 's'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap">
                            <span className={`px-2 py-1 rounded text-xs font-semibold capitalize ${
                              booking.status === 'completed'
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                : booking.status === 'in-progress'
                                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            }`}>
                              {formatStatusLabel(booking.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-bold text-gray-900 dark:text-white whitespace-nowrap">
                            {formatCurrency(getBookingRevenue(booking), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </AdminMainContent>
    </div>
  );
}
