"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminMainContent from '../components/AdminMainContent';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import EmptyState from '@/app/components/EmptyState';
import LoadingSpinner from '@/app/components/LoadingSpinner';

interface Booking {
  id: string;
  name: string;
  surname: string;
  email: string;
  mobile: string;
  room: string;
  checkIn: string;
  checkOut: string;
  guests: string;
  status: 'pending' | 'confirmed' | 'in-progress' | 'cancelled' | 'completed';
  createdAt: { seconds: number; nanoseconds: number } | Date;
}

type CompletedTab = 'checkins' | 'pending' | 'checkouts' | 'cancelled' | 'completed';

const completedTabs: CompletedTab[] = ['checkins', 'pending', 'checkouts', 'cancelled', 'completed'];

const isActiveStayStatus = (status: string) => status === 'confirmed' || status === 'in-progress';

const formatStatusLabel = (status: string) =>
  status
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

function CompletedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useProtectedAdminPage();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const tabParam = searchParams.get('tab') as CompletedTab | null;
  const activeTab: CompletedTab = tabParam && completedTabs.includes(tabParam) ? tabParam : 'checkins';

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookingsData: Booking[] = [];
      snapshot.forEach((doc) => {
        bookingsData.push({
          id: doc.id,
          ...doc.data()
        } as Booking);
      });
      setBookings(bookingsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-50 to-blue-50">
        <div className="text-xl text-gray-700">Loading...</div>
      </div>
    );
  }

  // Filter bookings
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Helper to safely parse date string to Date object (handles both ISO and local formats)
  const parseBookingDate = (dateStr: string | undefined): Date | null => {
    if (!dateStr) return null;
    try {
      const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
      const d = dateOnlyMatch
        ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
        : new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      return d;
    } catch {
      return null;
    }
  };

  // In-house: active guests currently occupying a room (checkIn <= today < checkOut)
  const checkIns = bookings.filter(b => {
    const checkInDate = parseBookingDate(b.checkIn);
    const checkOutDate = parseBookingDate(b.checkOut);
    if (!checkInDate || !checkOutDate) return false;
    checkInDate.setHours(0, 0, 0, 0);
    checkOutDate.setHours(0, 0, 0, 0);
    const checkInTime = checkInDate.getTime();
    const checkOutTime = checkOutDate.getTime();
    return isActiveStayStatus(b.status) && checkInTime <= today.getTime() && checkOutTime > today.getTime();
  });

  const pending = bookings.filter(b => b.status === 'pending');

  // Check-outs: Guests leaving today (check-out date is today)
  const checkOuts = bookings.filter(b => {
    const checkOutDate = parseBookingDate(b.checkOut);
    if (!checkOutDate) return false;
    checkOutDate.setHours(0, 0, 0, 0);
    return checkOutDate.getTime() === today.getTime() && isActiveStayStatus(b.status);
  });

  // Past check-outs: Only show recent past check-outs (last 30 days) to avoid loading thousands of records
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const pastCheckOuts = bookings.filter(b => {
    const checkOutDate = parseBookingDate(b.checkOut);
    if (!checkOutDate) return false;
    checkOutDate.setHours(0, 0, 0, 0);
    const checkOutTime = checkOutDate.getTime();
    return checkOutTime < today.getTime() && checkOutTime >= thirtyDaysAgo.getTime() && isActiveStayStatus(b.status);
  });

  const cancelled = bookings.filter(b => b.status === 'cancelled');

  // Completed: Bookings that have been marked as completed (checked out and finalized)
  const completed = bookings.filter(b => b.status === 'completed');

  const getDisplayData = () => {
    switch (activeTab) {
      case 'checkins':
        return checkIns;
      case 'pending':
        return pending;
      case 'checkouts':
        return [...checkOuts, ...pastCheckOuts];
      case 'cancelled':
        return cancelled;
      case 'completed':
        return completed;
      default:
        return [];
    }
  };

  const displayData = getDisplayData();
  const highlightedBookingId = searchParams.get('bookingId');

  const handleTabChange = (tab: CompletedTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    params.delete('bookingId');
    router.push(`/admin/completed?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <Header />

      <AdminMainContent>
        {/* Header */}
        <div className="admin-page-header mb-6">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            Completed & Activity
          </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
            Track check-ins, check-outs, cancelled, and completed bookings
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">In-house</p>
            <p className="text-3xl font-semibold text-gray-900 dark:text-white">{checkIns.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Confirmed or checked in</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Pending</p>
            <p className="text-3xl font-semibold text-gray-900 dark:text-white">{pending.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Awaiting confirmation</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Check-outs</p>
            <p className="text-3xl font-semibold text-gray-900 dark:text-white">{checkOuts.length + pastCheckOuts.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Today + last 30 days</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Cancelled</p>
            <p className="text-3xl font-semibold text-gray-900 dark:text-white">{cancelled.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Total cancellations</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Completed</p>
            <p className="text-3xl font-semibold text-gray-900 dark:text-white">{completed.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Marked as completed</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-1 mb-4 inline-flex gap-1">
          <button
            onClick={() => handleTabChange('checkins')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'checkins'
                ? 'bg-green-500 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            In-house ({checkIns.length})
          </button>
          <button
            onClick={() => handleTabChange('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'pending'
                ? 'bg-amber-500 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Pending ({pending.length})
          </button>
          <button
            onClick={() => handleTabChange('checkouts')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'checkouts'
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Check-outs ({checkOuts.length + pastCheckOuts.length})
          </button>
          <button
            onClick={() => handleTabChange('cancelled')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'cancelled'
                ? 'bg-red-500 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Cancelled ({cancelled.length})
          </button>
          <button
            onClick={() => handleTabChange('completed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'completed'
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Completed ({completed.length})
          </button>
        </div>

        {/* Content */}
        <div className="admin-table-shell bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-2xl shadow-xl overflow-hidden border border-gray-200/50 dark:border-gray-700/50 hover:shadow-2xl transition-all duration-300">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner size="lg" text="Loading bookings..." />
            </div>
          ) : displayData.length === 0 ? (
            <div className="py-20">
              <EmptyState
                title="No records found"
                description={
                  activeTab === 'checkins'
                    ? "No active guests are currently in-house."
                    : activeTab === 'pending'
                    ? "No pending bookings found. Reservations awaiting approval will appear here."
                    : activeTab === 'checkouts'
                    ? "No check-outs in the last 30 days. Guests who checked out recently will appear here."
                    : activeTab === 'cancelled'
                    ? "No cancelled bookings found. Cancelled reservations will appear here."
                    : "No completed bookings found. Bookings marked as completed will appear here."
                }
                icon={
                  <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="admin-data-table w-full">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">#</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Guest Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Room</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Check-in</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Check-out</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Guests</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
                  {displayData.map((booking, idx) => (
                    <tr
                      key={booking.id}
                      className={`transition-colors ${
                        highlightedBookingId === booking.id
                          ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-inset ring-blue-400'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                        {idx + 1}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">
                        {booking.name} {booking.surname}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                        {booking.room}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                        {new Date(booking.checkIn).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                        {new Date(booking.checkOut).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300 text-center">
                        {booking.guests}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                        <div className="font-medium">{booking.email}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{booking.mobile}</div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          booking.status === 'confirmed'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : booking.status === 'in-progress'
                            ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
                            : booking.status === 'pending'
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                            : booking.status === 'completed'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}>
                          {formatStatusLabel(booking.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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

export default function Completed() {
  return (
    <Suspense fallback={<AdminPageFallback />}>
      <CompletedContent />
    </Suspense>
  );
}
