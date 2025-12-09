"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminMainContent from '../components/AdminMainContent';
import { auth, db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, where, Timestamp, getDocs } from 'firebase/firestore';
import { Room } from '@/lib/types/room';
import { isAuthorizedAdmin, isNemsuEmail } from '@/lib/adminAuth';
import { logInfo, logError } from '@/lib/logger';

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
  createdAt: any;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [totalRooms, setTotalRooms] = useState<number>(0);
  const [roomTypes, setRoomTypes] = useState<string[]>([]);
  const [underMaintenance, setUnderMaintenance] = useState<number>(0);
  const [roomsUnderMaintenance, setRoomsUnderMaintenance] = useState<Set<string>>(new Set());
  const [todayCheckIns, setTodayCheckIns] = useState<number>(0);
  const [todayCheckOuts, setTodayCheckOuts] = useState<number>(0);

  useEffect(() => {
    const adminAuth = sessionStorage.getItem('adminAuth');
    const adminEmail = sessionStorage.getItem('adminEmail');

    // Check authentication
    if (adminAuth !== 'true') {
      router.push('/admin');
      return;
    }

    // Check if email exists and is from Google Sign-In
    if (adminEmail && adminEmail.includes('@')) {
      // First check: Must be NEMSU institution email
      if (!isNemsuEmail(adminEmail)) {
        auth.signOut();
        sessionStorage.removeItem('adminAuth');
        sessionStorage.removeItem('adminEmail');
        router.push('/admin');
        return;
      }

      // Second check: Must be in authorized list
      if (!isAuthorizedAdmin(adminEmail)) {
        auth.signOut();
        sessionStorage.removeItem('adminAuth');
        sessionStorage.removeItem('adminEmail');
        router.push('/admin');
        return;
      }
    }

    setIsAuthenticated(true);

    const bookingsQuery = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
    const unsubscribeBookings = onSnapshot(bookingsQuery, (snapshot) => {
      const bookingData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Booking[];
      setBookings(bookingData);

      // Calculate today's check-ins and check-outs
      const today = new Date().toISOString().split('T')[0];
      const checkInsToday = bookingData.filter(b => {
        if (!b.checkIn) return false;
        const checkInDate = b.checkIn.split('T')[0];
        return checkInDate === today && b.status === 'confirmed';
      }).length;
      const checkOutsToday = bookingData.filter(b => {
        if (!b.checkOut) return false;
        const checkOutDate = b.checkOut.split('T')[0];
        return checkOutDate === today && b.status === 'confirmed';
      }).length;
      setTodayCheckIns(checkInsToday);
      setTodayCheckOuts(checkOutsToday);

      logInfo('📅 Today:', today);
      logInfo('✅ Check-ins today:', checkInsToday);
      logInfo('👋 Check-outs today:', checkOutsToday);

      setLoading(false);
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
          logInfo('🏨 Room types:', uniqueRoomNames);
          
          setRoomTypes(uniqueRoomNames);
          setTotalRooms(uniqueRoomNames.length);
          
          // Also store full room data
          const roomsData: Room[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            roomsData.push({
              id: doc.id,
              name: data.name,
              price: data.price,
              description: data.description || '',
              image: data.image || '',
              perBed: data.perBed,
              maxGuests: data.maxGuests || 2,
            } as Room);
          });
          setRooms(roomsData);
        } else {
          // If collection is empty, set empty arrays
          setRoomTypes([]);
          setTotalRooms(0);
          setRooms([]);
        }
      } catch (error) {
        logError('Error fetching rooms from Firestore:', error);
        setRoomTypes([]);
        setTotalRooms(0);
        setRooms([]);
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
      setRoomsUnderMaintenance(maintenanceSet);
      setUnderMaintenance(maintenanceSet.size);
    });

    return () => {
      unsubscribeBookings();
      unsubscribeMaintenance();
    };
  }, [router]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1a3a52' }}>
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Calculate metrics - Only confirmed bookings affect availability
  const pendingCount = bookings.filter(b => b.status === 'pending').length;
  const confirmedCount = bookings.filter(b => b.status === 'confirmed').length;
  const cancelledCount = bookings.filter(b => b.status === 'cancelled').length;
  const completedCount = bookings.filter(b => b.status === 'completed').length;

  // Calculate actual room availability based on active bookings and maintenance
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  // Get room types that have active bookings today (checkIn <= today && checkOut >= today)
  const occupiedRoomTypes = new Set<string>();
  bookings.forEach(b => {
    if (b.status === 'confirmed' && b.room && b.checkIn && b.checkOut) {
      const checkIn = new Date(b.checkIn);
      const checkOut = new Date(b.checkOut);
      checkIn.setHours(0, 0, 0, 0);
      checkOut.setHours(0, 0, 0, 0);
      const checkInTime = checkIn.getTime();
      const checkOutTime = checkOut.getTime();
      
      // Room is occupied if today falls within booking period (checkout day is exclusive - matches BookingModal logic)
      // Checkout day is available for new bookings
      if (checkInTime <= todayTime && checkOutTime > todayTime) {
        occupiedRoomTypes.add(b.room);
      }
    }
  });

  // Available rooms = total room types - occupied - under maintenance
  const availableRooms = totalRooms - occupiedRoomTypes.size - underMaintenance;
  // Occupancy rate = (occupied room types / total room types) * 100
  const occupancyRate = totalRooms > 0 ? Math.round((occupiedRoomTypes.size / totalRooms) * 100) : 0;

  // Get recent activity (last 10 items from bookings and maintenance)
  const recentActivity = [
    ...bookings.slice(0, 5).map(b => ({
      type: 'booking',
      message: `${b.status === 'confirmed' ? '✅' : b.status === 'pending' ? '⏳' : b.status === 'completed' ? '✔️' : '❌'} Booking for ${b.name} ${b.surname} - ${b.room}`,
      time: b.createdAt,
      status: b.status
    })),
    ...maintenanceTasks.slice(0, 5).map(t => ({
      type: 'maintenance',
      message: `🔧 Maintenance: ${t.room} - ${t.issue}`,
      time: t.createdAt,
      status: t.status
    }))
  ]
  .sort((a, b) => {
    const timeA = a.time?.toMillis?.() || 0;
    const timeB = b.time?.toMillis?.() || 0;
    return timeB - timeA;
  })
  .slice(0, 8);

  const getTimeAgo = (timestamp: any) => {
    if (!timestamp) return 'Recently';
    const now = Date.now();
    const time = timestamp.toMillis?.() || timestamp;
    const diff = now - time;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <Header />

      <AdminMainContent>
        {/* Header Section */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
                Dashboard
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
                Real-time overview of UNITEL Hotel
              </p>
            </div>
            <div className="hidden md:flex items-center gap-6 px-4 py-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">Check-ins</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{todayCheckIns}</p>
              </div>
              <div className="w-px h-8 bg-gray-200 dark:bg-gray-700"></div>
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">Check-outs</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{todayCheckOuts}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Metrics Cards */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            {/* Total Rooms */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Rooms</p>
              <p className="text-3xl font-semibold text-gray-900 dark:text-white">{totalRooms}</p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Room Types</p>
            </div>

            {/* Occupied Rooms */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Occupied</p>
              <p className="text-3xl font-semibold text-gray-900 dark:text-white">{confirmedCount}</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: `${occupancyRate}%` }}></div>
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">{occupancyRate}%</span>
              </div>
            </div>

            {/* Available Rooms */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Available</p>
              <p className="text-3xl font-semibold text-gray-900 dark:text-white">{availableRooms}</p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Ready for booking</p>
            </div>

            {/* Under Maintenance */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Maintenance</p>
              <p className="text-3xl font-semibold text-gray-900 dark:text-white">{underMaintenance}</p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Active tasks</p>
            </div>
          </div>

          {/* Booking Status Overview */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Pending</h3>
                <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-xs font-medium">{pendingCount}</span>
              </div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{pendingCount}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Awaiting confirmation</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Confirmed</h3>
                <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs font-medium">{confirmedCount}</span>
              </div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{confirmedCount}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Active bookings</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Cancelled</h3>
                <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs font-medium">{cancelledCount}</span>
              </div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{cancelledCount}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total cancellations</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Completed</h3>
                <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-medium">{completedCount}</span>
              </div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{completedCount}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Marked as completed</p>
            </div>
          </div>

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
                    recentActivity.map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-200 dark:border-gray-600">
                        <div className="flex-1">
                          <p className="text-sm text-gray-700 dark:text-gray-300">{item.message}</p>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{getTimeAgo(item.time)}</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded font-medium ${
                          item.status === 'confirmed' || item.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                          item.status === 'pending' || item.status === 'in-progress' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                          'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}>
                          {item.status}
                        </span>
                      </div>
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
