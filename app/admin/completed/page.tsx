"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminMainContent from '../components/AdminMainContent';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
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
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  createdAt: any;
}

export default function Completed() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useProtectedAdminPage();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'checkins' | 'checkouts' | 'cancelled' | 'completed'>('checkins');

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
  const today = new Date().toISOString().split('T')[0];
  const checkIns = bookings.filter(b => {
    if (!b.checkIn) return false;
    const checkInDate = b.checkIn.split('T')[0];
    return checkInDate === today && b.status === 'confirmed';
  });

  const checkOuts = bookings.filter(b => {
    if (!b.checkOut) return false;
    const checkOutDate = b.checkOut.split('T')[0];
    return checkOutDate === today && b.status === 'confirmed';
  });

  const pastCheckOuts = bookings.filter(b => {
    if (!b.checkOut) return false;
    const checkOutDate = b.checkOut.split('T')[0];
    return checkOutDate < today && b.status === 'confirmed';
  });

  const cancelled = bookings.filter(b => b.status === 'cancelled');
  const completed = bookings.filter(b => b.status === 'completed');

  const getDisplayData = () => {
    switch (activeTab) {
      case 'checkins':
        return checkIns;
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <Header />

      <AdminMainContent>
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            Completed & Activity
          </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
            Track check-ins, check-outs, cancelled, and completed bookings
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Today's Check-ins</p>
            <p className="text-3xl font-semibold text-gray-900 dark:text-white">{checkIns.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Guests arriving today</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Check-outs</p>
            <p className="text-3xl font-semibold text-gray-900 dark:text-white">{checkOuts.length + pastCheckOuts.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Completed stays</p>
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
            onClick={() => setActiveTab('checkins')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'checkins'
                ? 'bg-green-500 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Check-ins ({checkIns.length})
          </button>
          <button
            onClick={() => setActiveTab('checkouts')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'checkouts'
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Check-outs ({checkOuts.length + pastCheckOuts.length})
          </button>
          <button
            onClick={() => setActiveTab('cancelled')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'cancelled'
                ? 'bg-red-500 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Cancelled ({cancelled.length})
          </button>
          <button
            onClick={() => setActiveTab('completed')}
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
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-2xl shadow-xl overflow-hidden border border-gray-200/50 dark:border-gray-700/50 hover:shadow-2xl transition-all duration-300">
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
                    ? "No check-ins scheduled for today. Check-ins will appear here when guests arrive."
                    : activeTab === 'checkouts'
                    ? "No check-outs scheduled. Completed stays will appear here."
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
              <table className="w-full">
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
                    <tr key={booking.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
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
                            : booking.status === 'completed'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}>
                          {booking.status === 'confirmed' ? 'Confirmed' : booking.status === 'completed' ? 'Completed' : 'Cancelled'}
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
