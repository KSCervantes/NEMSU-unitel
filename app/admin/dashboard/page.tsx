"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminMainContent from '../components/AdminMainContent';
import { auth, db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { isNemsuEmail } from '@/lib/adminAuth';
import { isAuthorizedAdminUser } from '@/lib/adminUsers';
import { logInfo, logError } from '@/lib/logger';
import { useHotelSettings } from '@/app/hooks/useHotelSettings';

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
  phone?: string;
  street?: string;
  street1?: string;
  region?: string;
  province?: string;
  city?: string;
  barangay?: string;
  zip?: string;
  specialRequests?: string;
}

interface MaintenanceTask {
  id: string;
  room: string;
  issue: string;
  priority: string;
  status: string;
  createdAt: { seconds: number; nanoseconds: number } | Date;
}

const formatStatusLabel = (status: string) => {
  if (status === 'in-progress') return 'In-House';

  return status
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const isActiveStayStatus = (status: string) => status === 'confirmed' || status === 'in-progress';

const getStatusBadgeClassName = (status: string) => {
  if (status === 'confirmed') return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
  if (status === 'in-progress') return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400';
  if (status === 'pending') return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
  if (status === 'completed') return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
  return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
};

export default function AdminDashboard() {
  const router = useRouter();
  const { settings: hotelSettings } = useHotelSettings(true);
  // IMPORTANT: Avoid reading sessionStorage during render (causes hydration mismatches).
  // We resolve auth on the client after mount.
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>([]);
  const [totalRooms, setTotalRooms] = useState<number>(0);
  const [todayCheckIns, setTodayCheckIns] = useState<number>(0);
  const [todayCheckOuts, setTodayCheckOuts] = useState<number>(0);
  const [underMaintenance, setUnderMaintenance] = useState<number>(0);
  const [renderNow] = useState(() => Date.now());

  const parseBookingDate = (dateStr?: string): Date | null => {
    if (!dateStr) return null;

    // Parse YYYY-MM-DD as local date to avoid UTC shift issues.
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const monthIndex = Number(dateOnlyMatch[2]) - 1;
      const day = Number(dateOnlyMatch[3]);
      const localDate = new Date(year, monthIndex, day);
      if (Number.isNaN(localDate.getTime())) return null;
      return localDate;
    }

    const parsedDate = new Date(dateStr);
    if (Number.isNaN(parsedDate.getTime())) return null;
    return parsedDate;
  };

  useEffect(() => {
    // Resolve auth from Firebase session callback for hydration-safe state updates
    let cancelled = false;
    const unsubscribe = auth.onAuthStateChanged(() => {
      void (async () => {
        try {
          const email = sessionStorage.getItem('adminEmail');
          const hasAdminSession = sessionStorage.getItem('adminAuth') === 'true';
          const ok = Boolean(
            hasAdminSession &&
            email &&
            isNemsuEmail(email) &&
            await isAuthorizedAdminUser(email)
          );

          if (!cancelled) {
            setAuthState(ok ? 'authenticated' : 'unauthenticated');
          }

          if (!ok) {
            await auth.signOut();
            sessionStorage.removeItem('adminAuth');
            sessionStorage.removeItem('adminEmail');
            router.push('/admin');
          }
        } catch (e) {
          logError('Error resolving admin session:', e);
          if (!cancelled) {
            setAuthState('unauthenticated');
          }
          router.push('/admin');
        }
      })();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (authState !== 'authenticated') return;

    const bookingsQuery = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
    const unsubscribeBookings = onSnapshot(bookingsQuery, (snapshot) => {
      const bookingData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Booking[];
      setBookings(bookingData);

      // Calculate in-house guests and today's check-outs.
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const checkInsToday = bookingData.filter((b) => {
        if (!isActiveStayStatus(b.status)) return false;
        const checkInDate = parseBookingDate(b.checkIn);
        const checkOutDate = parseBookingDate(b.checkOut);
        if (!checkInDate || !checkOutDate) return false;
        checkInDate.setHours(0, 0, 0, 0);
        checkOutDate.setHours(0, 0, 0, 0);
        return checkInDate.getTime() <= today.getTime() && checkOutDate.getTime() > today.getTime();
      }).length;

      const checkOutsToday = bookingData.filter((b) => {
        if (!isActiveStayStatus(b.status)) return false;
        const checkOutDate = parseBookingDate(b.checkOut);
        if (!checkOutDate) return false;
        checkOutDate.setHours(0, 0, 0, 0);
        return checkOutDate.getTime() === today.getTime();
      }).length;
      setTodayCheckIns(checkInsToday);
      setTodayCheckOuts(checkOutsToday);

      logInfo('Today:', today.toISOString().split('T')[0]);
      logInfo('In-house guests:', checkInsToday);
      logInfo('Active check-outs today:', checkOutsToday);

    });

    // Fetch room types from Firestore (factual source)
    const fetchRoomTypes = async () => {
      try {
        const roomsRef = collection(db, 'rooms');
        const snapshot = await getDocs(roomsRef);
        if (!snapshot.empty) {
          // Get all room names and deduplicate (count unique room types only)
          const allRoomNames = snapshot.docs.map(doc => doc.data().name).filter(Boolean);
          const uniqueRoomNames = Array.from(new Set(allRoomNames));

          logInfo('🏨 Total documents in rooms collection:', snapshot.docs.length);
          logInfo('🏨 Unique room types:', uniqueRoomNames.length);
          setTotalRooms(uniqueRoomNames.length);
        } else {
          // If collection is empty, set empty arrays
          setTotalRooms(0);
        }
      } catch (error) {
        logError('Error fetching rooms from Firestore:', error);
        setTotalRooms(0);
      }
    };

    fetchRoomTypes();

    // Fetch all maintenance tasks for recent activity
    const maintenanceQuery = query(collection(db, 'maintenance'), orderBy('createdAt', 'desc'));
    const unsubscribeMaintenance = onSnapshot(maintenanceQuery, (snapshot) => {
      const tasks = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as MaintenanceTask[];
      setMaintenanceTasks(tasks);

      // Track which room types are under maintenance
      const maintenanceSet = new Set<string>();
      tasks.forEach(t => {
        if ((t.status === 'pending' || t.status === 'in-progress') && t.room) {
          maintenanceSet.add(t.room);
        }
      });
      setUnderMaintenance(maintenanceSet.size);
    });

    return () => {
      unsubscribeBookings();
      unsubscribeMaintenance();
    };
  }, [authState]);

  // Keep the server + first client render identical to avoid hydration mismatch
  if (authState !== 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1a3a52' }}>
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Calculate metrics. Confirmed and in-progress bookings both reserve room availability.
  const pendingCount = bookings.filter(b => b.status === 'pending').length;
  const confirmedCount = bookings.filter(b => b.status === 'confirmed').length;
  const inProgressCount = bookings.filter(b => b.status === 'in-progress').length;
  const cancelledCount = bookings.filter(b => b.status === 'cancelled').length;
  const completedCount = bookings.filter(b => b.status === 'completed').length;

  // Calculate actual room availability based on active bookings and maintenance
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  // Get rooms that have active bookings today (checkIn <= today && checkOut > today)
  // A room is occupied only if someone is currently checked in (not pending future bookings)
  const occupiedRooms = new Set<string>();
  bookings.forEach(b => {
    if (isActiveStayStatus(b.status) && b.room && b.checkIn && b.checkOut) {
      const checkIn = parseBookingDate(b.checkIn);
      const checkOut = parseBookingDate(b.checkOut);
      if (!checkIn || !checkOut) return;
      checkIn.setHours(0, 0, 0, 0);
      checkOut.setHours(0, 0, 0, 0);
      const checkInTime = checkIn.getTime();
      const checkOutTime = checkOut.getTime();

      // Room is occupied if today falls within booking period (checkout day is exclusive)
      // checkInTime <= todayTime AND checkOutTime > todayTime means someone is checked in today
      if (checkInTime <= todayTime && checkOutTime > todayTime) {
        occupiedRooms.add(b.room);
      }
    }
  });

  // Available rooms = total room types - occupied - under maintenance
  const occupiedCount = occupiedRooms.size;
  const availableRooms = Math.max(totalRooms - occupiedCount - underMaintenance, 0);
  // Occupancy rate = (occupied rooms / total rooms) * 100
  const occupancyRate = totalRooms > 0 ? Math.round((occupiedCount / totalRooms) * 100) : 0;

  // Get recent activity (last 10 items from bookings and maintenance)
  const recentActivity = [
    ...bookings.slice(0, 5).map(b => ({
      id: `booking-${b.id}`,
      type: 'booking',
      message: `Booking ${formatStatusLabel(b.status)} for ${b.name} ${b.surname} - ${b.room}`,
      time: b.createdAt,
      status: b.status,
      href: b.status === 'completed'
        ? `/admin/completed?tab=completed&bookingId=${b.id}`
        : `/admin/reservations?status=${b.status}&bookingId=${b.id}`
    })),
    ...maintenanceTasks.slice(0, 5).map(t => ({
      id: `maintenance-${t.id}`,
      type: 'maintenance',
      message: `Maintenance: ${t.room} - ${t.issue}`,
      time: t.createdAt,
      status: t.status,
      href: `/admin/maintenance?status=${t.status === 'completed' ? 'completed' : 'active'}&taskId=${t.id}`
    }))
  ]
  .sort((a, b) => {
    const toTime = (ts: { seconds?: number; nanoseconds?: number; toMillis?: () => number } | Date | number | null | undefined) => {
      if (!ts) return 0;
      if (typeof ts === 'number') return ts;
      if (ts instanceof Date) return ts.getTime();
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (typeof ts.seconds === 'number') return ts.seconds * 1000;
      return 0;
    };

    const timeA = toTime(a.time);
    const timeB = toTime(b.time);
    return timeB - timeA;
  })
  .slice(0, 8);

  const getTimeAgo = (
    timestamp:
      | { toMillis?: () => number; seconds?: number; nanoseconds?: number }
      | Date
      | number
      | null
  ) => {
    if (!timestamp) return 'Recently';
    const now = renderNow;
    let time: number;
    if (typeof timestamp === 'number') {
      time = timestamp;
    } else if (timestamp instanceof Date) {
      time = timestamp.getTime();
    } else if (timestamp.toMillis && typeof timestamp.toMillis === 'function') {
      time = timestamp.toMillis();
    } else if (typeof timestamp.seconds === 'number') {
      time = timestamp.seconds * 1000;
    } else {
      return 'Recently';
    }
    const diff = now - time;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const cardClassName = "group w-full text-left bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 transition-all hover:-translate-y-0.5 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900";
  const cardFooterClassName = "mt-3 inline-flex items-center text-xs font-semibold text-blue-600 dark:text-blue-400";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <Header />

      <AdminMainContent>
        {/* Header Section */}
        <div className="admin-page-header mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
                Dashboard
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
                Real-time overview of {hotelSettings.hotelName}
              </p>
            </div>
            <div className="hidden md:flex items-center gap-6 px-4 py-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => router.push('/admin/completed?tab=checkins')}
                className="text-center rounded-md px-2 py-1 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Open In-House guests"
              >
                <p className="text-xs text-gray-500 dark:text-gray-400">In-House</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{todayCheckIns}</p>
              </button>
              <div className="w-px h-8 bg-gray-200 dark:bg-gray-700"></div>
              <button
                type="button"
                onClick={() => router.push('/admin/completed?tab=checkouts')}
                className="text-center rounded-md px-2 py-1 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Open today's check-outs"
              >
                <p className="text-xs text-gray-500 dark:text-gray-400">Today&apos;s Check-outs</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{todayCheckOuts}</p>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <section>
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Room Inventory</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Rooms, availability, and maintenance capacity</p>
            </div>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => router.push('/admin/room?status=all')}
                className={cardClassName}
                aria-label="Open all rooms"
              >
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Rooms</p>
                <p className="text-3xl font-semibold text-gray-900 dark:text-white">{totalRooms}</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Room Types</p>
                <span className={cardFooterClassName}>View rooms</span>
              </button>

              <button
                type="button"
                onClick={() => router.push('/admin/room?status=occupied')}
                className={cardClassName}
                aria-label="Open occupied rooms"
              >
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Occupied</p>
                <p className="text-3xl font-semibold text-gray-900 dark:text-white">{occupiedCount}</p>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: `${occupancyRate}%` }}></div>
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">{occupancyRate}%</span>
                </div>
                <span className={cardFooterClassName}>View occupied</span>
              </button>

              <button
                type="button"
                onClick={() => router.push('/admin/room?status=available')}
                className={cardClassName}
                aria-label="Open available rooms"
              >
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Available</p>
                <p className="text-3xl font-semibold text-gray-900 dark:text-white">{availableRooms}</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Ready for booking</p>
                <span className={cardFooterClassName}>View available</span>
              </button>

              <button
                type="button"
                onClick={() => router.push('/admin/room?status=maintenance')}
                className={cardClassName}
                aria-label="Open rooms under maintenance"
              >
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Maintenance</p>
                <p className="text-3xl font-semibold text-gray-900 dark:text-white">{underMaintenance}</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Active tasks</p>
                <span className={cardFooterClassName}>View rooms</span>
              </button>
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Booking Workflow</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Reservation queues by current status</p>
            </div>
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-5">
              <button
                type="button"
                onClick={() => router.push('/admin/reservations?status=pending')}
                className={cardClassName}
                aria-label="Open pending reservations"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Pending</h3>
                  <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-xs font-medium">{pendingCount}</span>
                </div>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{pendingCount}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Awaiting confirmation</p>
                <span className={cardFooterClassName}>View pending</span>
              </button>

              <button
                type="button"
                onClick={() => router.push('/admin/reservations?status=confirmed')}
                className={cardClassName}
                aria-label="Open confirmed reservations"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Confirmed</h3>
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs font-medium">{confirmedCount}</span>
                </div>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{confirmedCount}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Approved, not checked in</p>
                <span className={cardFooterClassName}>View confirmed</span>
              </button>

              <button
                type="button"
                onClick={() => router.push('/admin/reservations?status=in-progress')}
                className={cardClassName}
                aria-label="Open In-House reservations"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">In-House</h3>
                  <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded text-xs font-medium">{inProgressCount}</span>
                </div>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{inProgressCount}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Checked-in guests</p>
                <span className={cardFooterClassName}>View In-House</span>
              </button>

              <button
                type="button"
                onClick={() => router.push('/admin/reservations?status=cancelled')}
                className={cardClassName}
                aria-label="Open cancelled reservations"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Cancelled</h3>
                  <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs font-medium">{cancelledCount}</span>
                </div>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{cancelledCount}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total cancellations</p>
                <span className={cardFooterClassName}>View cancelled</span>
              </button>

              <button
                type="button"
                onClick={() => router.push('/admin/completed?tab=completed')}
                className={cardClassName}
                aria-label="Open completed bookings"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Completed</h3>
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-medium">{completedCount}</span>
                </div>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{completedCount}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Marked as completed</p>
                <span className={cardFooterClassName}>View completed</span>
              </button>
            </div>
          </section>

          {/* Activity & Quick Actions */}
          <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
            {/* Recent Activity */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="bg-gray-100 dark:bg-gray-700 px-5 py-3 border-b border-gray-200 dark:border-gray-600">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
              </div>
              <div className="p-5">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {recentActivity.length > 0 ? (
                    recentActivity.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => router.push(item.href)}
                        className="group flex w-full items-start justify-between gap-3 p-3 text-left bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-200 dark:border-gray-600 transition-colors hover:bg-white dark:hover:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <div className="flex-1">
                          <p className="text-sm text-gray-700 dark:text-gray-300">{item.message}</p>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{getTimeAgo(item.time)}</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded font-medium ${
                          getStatusBadgeClassName(item.status)
                        }`}>
                          {formatStatusLabel(item.status)}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-gray-500 dark:text-gray-400">No recent activity</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="bg-gray-100 dark:bg-gray-700 px-5 py-3 border-b border-gray-200 dark:border-gray-600">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Quick Actions</h3>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => router.push('/admin/reservations')}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span className="text-sm font-medium">Reservations</span>
                  </button>

                  <button
                    onClick={() => router.push('/admin/maintenance')}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-800 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-sm font-medium">Maintenance</span>
                  </button>

                  <button
                    onClick={() => router.push('/admin/room')}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 border border-purple-200 dark:border-purple-800 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className="text-sm font-medium">Rooms</span>
                  </button>

                  <button
                    onClick={() => router.push('/admin/calendar')}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 border border-green-200 dark:border-green-800 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm font-medium">Calendar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AdminMainContent>
    </div>
  );
}
