"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminMainContent from '../components/AdminMainContent';
import { db } from '@/lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';

type FilterPeriod = 'all' | 'week' | 'month';

export default function Revenue() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useProtectedAdminPage();
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [confirmedBookings, setConfirmedBookings] = useState(0);
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('all');
  const [allBookings, setAllBookings] = useState<any[]>([]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // Real-time listener for bookings
    const bookingsQuery = query(collection(db, 'bookings'));
    const unsubscribe = onSnapshot(bookingsQuery, (snapshot) => {
      const bookings: any[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status === 'confirmed') {
          bookings.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt) || new Date()
          });
        }
      });

      setAllBookings(bookings);
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  // Calculate revenue based on filter
  useEffect(() => {
    const now = new Date();
    let filteredBookings = allBookings;

    if (filterPeriod === 'week') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(now.getDate() - 7);
      filteredBookings = allBookings.filter(booking =>
        booking.createdAt >= oneWeekAgo
      );
    } else if (filterPeriod === 'month') {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(now.getMonth() - 1);
      filteredBookings = allBookings.filter(booking =>
        booking.createdAt >= oneMonthAgo
      );
    }

    let revenue = 0;
    filteredBookings.forEach((booking) => {
      let bookingRevenue = 0;

      if (booking.payment && typeof booking.payment === 'object' && 'total' in booking.payment) {
        bookingRevenue = parseFloat(booking.payment.total.toString()) || 0;
      } else if (booking.totalPrice) {
        bookingRevenue = parseFloat(booking.totalPrice.toString()) || 0;
      } else if (booking.totalAmount) {
        bookingRevenue = parseFloat(booking.totalAmount.toString()) || 0;
      }

      if (!isNaN(bookingRevenue) && bookingRevenue > 0) {
        revenue += bookingRevenue;
      }
    });

    setTotalRevenue(revenue);
    setConfirmedBookings(filteredBookings.length);
  }, [allBookings, filterPeriod]);

  // Export CSV function
  const handleExportCSV = () => {
    const now = new Date();
    let filteredBookings = allBookings;

    if (filterPeriod === 'week') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(now.getDate() - 7);
      filteredBookings = allBookings.filter(booking =>
        booking.createdAt >= oneWeekAgo
      );
    } else if (filterPeriod === 'month') {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(now.getMonth() - 1);
      filteredBookings = allBookings.filter(booking =>
        booking.createdAt >= oneMonthAgo
      );
    }

    // Prepare CSV headers
    const headers = ['Booking ID', 'Room', 'Guests', 'Check-in Date', 'Check-out Date', 'Nights', 'Base Price', 'Extra Fee', 'Total Revenue', 'Date Confirmed'];

    // Prepare CSV rows
    const rows = filteredBookings.map(booking => [
      booking.id || '',
      booking.room || '',
      booking.guests || '',
      booking.checkIn?.toDate?.() ? new Date(booking.checkIn.toDate()).toLocaleDateString() : (booking.checkIn ? new Date(booking.checkIn).toLocaleDateString() : ''),
      booking.checkOut?.toDate?.() ? new Date(booking.checkOut.toDate()).toLocaleDateString() : (booking.checkOut ? new Date(booking.checkOut).toLocaleDateString() : ''),
      booking.payment?.nights || booking.nights || '',
      booking.payment?.basePrice || '',
      booking.payment?.extraFee || '0',
      booking.payment?.total || booking.totalPrice || booking.totalAmount || '0',
      booking.createdAt.toLocaleDateString() + ' ' + booking.createdAt.toLocaleTimeString()
    ]);

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape quotes and wrap in quotes if contains comma
        const cellStr = String(cell);
        return cellStr.includes(',') ? `"${cellStr.replace(/"/g, '""')}"` : cellStr;
      }).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const periodLabel = filterPeriod === 'all' ? 'all-time' : filterPeriod === 'week' ? 'weekly' : 'monthly';
    const timestamp = new Date().toISOString().split('T')[0];

    link.setAttribute('href', url);
    link.setAttribute('download', `revenue-report-${periodLabel}-${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            Revenue
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
            Total revenue from confirmed bookings
          </p>
        </div>

        {/* Filter Buttons */}
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by Period:</span>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <button
                onClick={() => setFilterPeriod('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterPeriod === 'all'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                All Time
              </button>
              <button
                onClick={() => setFilterPeriod('week')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterPeriod === 'week'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => setFilterPeriod('month')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterPeriod === 'month'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                This Month
              </button>

              {/* Export CSV Button */}
              <button
                onClick={handleExportCSV}
                className="ml-2 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white shadow-sm transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16v-4m0 0V8m0 4h4m-4 0h-4" />
                </svg>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Revenue Display */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Total Revenue Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Revenue</div>
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              ₱{totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {filterPeriod === 'all' && 'From all confirmed bookings'}
              {filterPeriod === 'week' && 'Last 7 days'}
              {filterPeriod === 'month' && 'Last 30 days'}
            </div>
          </div>

          {/* Confirmed Bookings Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">Confirmed Bookings</div>
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              {confirmedBookings}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Revenue-generating bookings
            </div>
          </div>
        </div>

        {/* Revenue Insights */}
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Revenue Insights</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Revenue Calculation</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Revenue is calculated from confirmed bookings only, ensuring accurate financial tracking.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Average Revenue per Booking</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {confirmedBookings > 0
                    ? `₱${(totalRevenue / confirmedBookings).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '₱0.00'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </AdminMainContent>
    </div>
  );
}
