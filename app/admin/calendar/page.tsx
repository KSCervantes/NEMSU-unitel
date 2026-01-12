"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminMainContent from '../components/AdminMainContent';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';
import Swal from 'sweetalert2';

interface Room {
  id: string;
  number: string;
  type: string;
  rate: number;
  capacity: number;
  status: string;
}

interface Booking {
  id: string;
  name: string;
  room: string;
  checkIn: string;
  checkOut: string;
  status: string;
  email?: string;
  phone?: string;
  guests?: number;
  totalAmount?: number;
  createdAt?: any;
  totalPrice?: number;
  payment?: {
    total?: number;
    basePrice?: number;
    extraFee?: number;
    nights?: number;
  };
}

interface MaintenanceTask {
  id: string;
  title: string;
  room: string;
  status: string;
  dueDate: string;
  priority: string;
}

export default function Calendar() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useProtectedAdminPage();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [bookingsByDay, setBookingsByDay] = useState<{ [key: string]: Booking[] }>({});
  const [checkoutsByDay, setCheckoutsByDay] = useState<{ [key: string]: Booking[] }>({});
  const [upcomingBookings, setUpcomingBookings] = useState<{ date: string; count: number; rooms: string[] }[]>([]);
  const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>([]);
  const [maintenanceByDay, setMaintenanceByDay] = useState<{ [key: string]: MaintenanceTask[] }>({});

  // New state for enhancements
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'checkin' | 'checkout' | 'maintenance'>('all');
  const [viewMode, setViewMode] = useState<'calendar' | 'week' | 'room-grid'>('calendar');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedMaintenance, setSelectedMaintenance] = useState<MaintenanceTask | null>(null);
  const [showMaintenance, setShowMaintenance] = useState(true);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // New state for notifications and alerts
  const [notifications, setNotifications] = useState<{
    type: 'checkin' | 'checkout' | 'maintenance' | 'overdue';
    message: string;
    date: Date;
    booking?: Booking;
    maintenance?: MaintenanceTask;
  }[]>([]);
  const [showNotifications, setShowNotifications] = useState(true);

  // New state for drag and drop
  const [draggedBooking, setDraggedBooking] = useState<Booking | null>(null);
  const [draggedRoom, setDraggedRoom] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      fetchBookings();
    }
  }, [isAuthenticated, isLoading]);

  const fetchBookings = async () => {
    try {
      // Fetch rooms
      const roomsRef = collection(db, 'rooms');
      const roomsSnapshot = await getDocs(roomsRef);
      const roomsData: Room[] = [];
      roomsSnapshot.forEach((doc) => {
        roomsData.push({
          id: doc.id,
          ...doc.data()
        } as Room);
      });
      setAllRooms(roomsData);

      // Fetch bookings
      const bookingsRef = collection(db, 'bookings');
      const snapshot = await getDocs(bookingsRef);

      const bookingsData: Booking[] = [];
      snapshot.forEach((doc) => {
        bookingsData.push({
          id: doc.id,
          ...doc.data()
        } as Booking);
      });

      setAllBookings(bookingsData);
      processBookingsByMonth(bookingsData, currentDate);

      // Fetch maintenance tasks
      const maintenanceRef = collection(db, 'maintenance');
      const maintenanceSnapshot = await getDocs(maintenanceRef);

      const maintenanceData: MaintenanceTask[] = [];
      maintenanceSnapshot.forEach((doc) => {
        maintenanceData.push({
          id: doc.id,
          ...doc.data()
        } as MaintenanceTask);
      });

      setMaintenanceTasks(maintenanceData);
      processMaintenanceByMonth(maintenanceData, currentDate);
      generateNotifications(bookingsData, maintenanceData);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    }
  };

  const processBookingsByMonth = (bookings: Booking[], date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const dayBookings: { [key: string]: Booking[] } = {};
    const dayCheckouts: { [key: string]: Booking[] } = {};
    const upcoming: { [key: string]: { count: number; rooms: Set<string> } } = {};

    // Only process confirmed bookings for calendar display
    const confirmedBookings = bookings.filter(b => b.status === 'confirmed');

    confirmedBookings.forEach((booking) => {
      const checkInDate = new Date(booking.checkIn);
      const checkOutDate = new Date(booking.checkOut);

      // Track check-ins
      if (checkInDate.getFullYear() === year && checkInDate.getMonth() === month) {
        const day = checkInDate.getDate().toString();
        if (!dayBookings[day]) dayBookings[day] = [];
        dayBookings[day].push(booking);

        const dateKey = checkInDate.toISOString().split('T')[0];
        if (!upcoming[dateKey]) {
          upcoming[dateKey] = { count: 0, rooms: new Set<string>() };
        }
        upcoming[dateKey].count++;
        upcoming[dateKey].rooms.add(booking.room);
      }

      // Track check-outs
      if (checkOutDate.getFullYear() === year && checkOutDate.getMonth() === month) {
        const day = checkOutDate.getDate().toString();
        if (!dayCheckouts[day]) dayCheckouts[day] = [];
        dayCheckouts[day].push(booking);
      }
    });

    setBookingsByDay(dayBookings);
    setCheckoutsByDay(dayCheckouts);

    const upcomingArray = Object.entries(upcoming)
      .map(([date, data]) => ({
        date,
        count: data.count,
        rooms: Array.from(data.rooms)
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);

    setUpcomingBookings(upcomingArray);
  };

  const processMaintenanceByMonth = (tasks: MaintenanceTask[], date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const dayTasks: { [key: string]: MaintenanceTask[] } = {};

    tasks.forEach((task) => {
      if (task.status !== 'completed' && task.dueDate) {
        const dueDate = new Date(task.dueDate);
        if (dueDate.getFullYear() === year && dueDate.getMonth() === month) {
          const day = dueDate.getDate().toString();
          if (!dayTasks[day]) dayTasks[day] = [];
          dayTasks[day].push(task);
        }
      }
    });

    setMaintenanceByDay(dayTasks);
  };

  const generateNotifications = (bookings: Booking[], maintenance: MaintenanceTask[]) => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const newNotifications: typeof notifications = [];

    // Check-in notifications
    bookings.filter(b => b.status === 'confirmed').forEach(booking => {
      const checkInDate = new Date(booking.checkIn);
      const checkOutDate = new Date(booking.checkOut);

      if (checkInDate >= now && checkInDate <= nextWeek) {
        if (checkInDate.toDateString() === now.toDateString()) {
          newNotifications.push({
            type: 'checkin',
            message: `${booking.name} checking in today - Room ${booking.room}`,
            date: checkInDate,
            booking
          });
        } else if (checkInDate.toDateString() === tomorrow.toDateString()) {
          newNotifications.push({
            type: 'checkin',
            message: `${booking.name} checking in tomorrow - Room ${booking.room}`,
            date: checkInDate,
            booking
          });
        }
      }

      // Overdue checkouts
      if (checkOutDate < now && booking.status === 'confirmed') {
        newNotifications.push({
          type: 'overdue',
          message: `Overdue checkout: ${booking.name} - Room ${booking.room}`,
          date: checkOutDate,
          booking
        });
      }
    });

    // Maintenance notifications
    maintenance.filter(t => t.status !== 'completed').forEach(task => {
      const dueDate = new Date(task.dueDate);
      if (dueDate >= now && dueDate <= nextWeek) {
        newNotifications.push({
          type: 'maintenance',
          message: `Maintenance due: ${task.title} - Room ${task.room}`,
          date: dueDate,
          maintenance: task
        });
      }
    });

    // Sort by date and limit to 10 most urgent
    newNotifications.sort((a, b) => a.date.getTime() - b.date.getTime());
    setNotifications(newNotifications.slice(0, 10));
  };

  useEffect(() => {
    if (allBookings.length > 0) {
      processBookingsByMonth(allBookings, currentDate);
    }
    if (maintenanceTasks.length > 0) {
      processMaintenanceByMonth(maintenanceTasks, currentDate);
    }
  }, [currentDate]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek };
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate);

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  // Helper functions for enhancements
  const getOccupancyStats = () => {
    const today = new Date().toISOString().split('T')[0];
    const occupiedRooms = new Set<string>();
    const maintenanceRooms = new Set<string>();

    allBookings.forEach(booking => {
      const checkIn = new Date(booking.checkIn).toISOString().split('T')[0];
      const checkOut = new Date(booking.checkOut).toISOString().split('T')[0];
      if (checkIn <= today && checkOut > today && booking.status === 'confirmed') {
        occupiedRooms.add(booking.room);
      }
    });

    maintenanceTasks.forEach(task => {
      if (task.status !== 'completed') {
        maintenanceRooms.add(task.room);
      }
    });

    const totalRooms = allRooms.length || 1; // Use actual room count from database
    const occupied = occupiedRooms.size;
    const maintenance = maintenanceRooms.size;
    const available = totalRooms - occupied - maintenance;
    const occupancyPercentage = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;

    return { occupied, available, maintenance, totalRooms, occupancyPercentage };
  };

  const getRevenueStats = () => {
    // Filter by last 30 days (to match Revenue page's "This Month" filter)
    const now = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(now.getMonth() - 1);

    const monthBookings = allBookings.filter(b => {
      const createdDate = b.createdAt instanceof Date ? b.createdAt : (b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt));
      return createdDate >= oneMonthAgo && (b.status === 'confirmed' || b.status === 'completed');
    });

    // Use actual totalAmount from booking (this is the most accurate)
    let totalRevenue = 0;

    monthBookings.forEach(booking => {
      let bookingRevenue = 0;

      // Priority order: payment.total -> totalPrice -> totalAmount
      if (booking.payment && typeof booking.payment === 'object' && booking.payment.total !== undefined) {
        bookingRevenue = parseFloat(booking.payment.total.toString()) || 0;
      } else if (booking.totalPrice) {
        bookingRevenue = parseFloat(booking.totalPrice.toString()) || 0;
      } else if (booking.totalAmount && booking.totalAmount > 0) {
        bookingRevenue = booking.totalAmount;
      } else {
        // Fallback: Calculate from room rate if no amount is available
        const room = allRooms.find(r => r.number === booking.room);
        if (room?.rate) {
          const nights = Math.ceil((new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / (1000 * 60 * 60 * 24));
          bookingRevenue = nights * room.rate;
        }
      }

      if (!isNaN(bookingRevenue) && bookingRevenue > 0) {
        totalRevenue += bookingRevenue;
      }
    });

    const stats = getOccupancyStats();
    const avgOccupancy = stats.occupancyPercentage + '%';
    const avgRevenuePerBooking = monthBookings.length > 0 ? totalRevenue / monthBookings.length : 0;

    return { totalBookings: monthBookings.length, totalRevenue, avgOccupancy, avgRevenuePerBooking };
  };

  const getAlerts = (booking: Booking): string[] => {
    const alerts: string[] = [];
    const checkOut = new Date(booking.checkOut);
    const now = new Date();

    if (booking.status === 'confirmed') {
      if (checkOut < now) alerts.push('Overdue checkout');
      if (checkOut.getTime() - now.getTime() < 24 * 60 * 60 * 1000) alerts.push('Checkout within 24 hours');
      if (new Date(booking.checkIn).toDateString() === now.toDateString()) alerts.push('Today check-in');
    }

    return alerts;
  };

  // Enhancement Functions
  const getDailyRevenue = (day: number): number => {
    const bookingsOnDay = bookingsByDay[day.toString()] || [];
    return bookingsOnDay.reduce((sum, b) => sum + (b.payment?.total || b.totalPrice || 0), 0);
  };

  const getOccupancyPercentage = (day: number): number => {
    const bookingsOnDay = bookingsByDay[day.toString()] || [];
    const occupiedRooms = new Set(bookingsOnDay.map(b => b.room)).size;
    return allRooms.length > 0 ? Math.round((occupiedRooms / allRooms.length) * 100) : 0;
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Date', 'Guest Name', 'Room', 'Check-in', 'Check-out', 'Status', 'Guests', 'Total Revenue'],
      ...allBookings.map(b => [
        new Date(b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt).toLocaleDateString(),
        b.name,
        b.room,
        new Date(b.checkIn).toLocaleDateString(),
        new Date(b.checkOut).toLocaleDateString(),
        b.status,
        b.guests || 1,
        b.payment?.total || b.totalPrice || 0
      ])
    ].map(row => row.join(',')).join('\n');

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));
    element.setAttribute('download', `bookings-${new Date().toISOString().split('T')[0]}.csv`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    Swal.fire({
      title: 'Success!',
      text: 'Calendar exported to CSV',
      icon: 'success',
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3000
    });
  };

  const exportToPDF = async () => {
    Swal.fire({
      title: 'Export Calendar',
      html: '<p>PDF export will generate a printable calendar with all bookings.</p>',
      icon: 'info',
      confirmButtonText: 'Coming Soon'
    });
  };

  const filteredBookings = allBookings.filter(booking => {
    const matchesSearch = booking.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         booking.room.includes(searchQuery);
    const matchesFilter = filterStatus === 'all' ||
                         (filterStatus === 'checkin' && booking.status === 'confirmed') ||
                         (filterStatus === 'checkout' && booking.status === 'confirmed');
    return matchesSearch && matchesFilter;
  });

  const filteredMaintenance = maintenanceTasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.room.includes(searchQuery);
    const matchesFilter = filterStatus === 'all' || filterStatus === 'maintenance';
    return matchesSearch && matchesFilter;
  });

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
        <div className="mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
                Calendar
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
                View and manage booking schedule
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${viewMode === 'calendar' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
              >
                📅 Calendar
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${viewMode === 'week' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
              >
                📋 Week
              </button>
              <button
                onClick={() => setViewMode('room-grid')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${viewMode === 'room-grid' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
              >
                🏠 Room Grid
              </button>
              <button
                onClick={exportToCSV}
                className="px-4 py-2 rounded-lg font-medium bg-green-500 hover:bg-green-600 text-white transition-colors"
              >
                📊 Export CSV
              </button>
              <button
                onClick={exportToPDF}
                className="px-4 py-2 rounded-lg font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                📄 Export PDF
              </button>
            </div>
          </div>

          {/* Occupancy Overview */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {(() => {
              const stats = getOccupancyStats();
              const revenue = getRevenueStats();
              return (
                <>
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 rounded-lg p-4 text-white shadow-lg">
                    <p className="text-sm font-medium opacity-90">Occupied</p>
                    <p className="text-3xl font-bold">{stats.occupied}</p>
                    <p className="text-xs opacity-75 mt-1">of {stats.totalRooms} rooms</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-500 to-green-600 dark:from-green-600 dark:to-green-700 rounded-lg p-4 text-white shadow-lg">
                    <p className="text-sm font-medium opacity-90">Available</p>
                    <p className="text-3xl font-bold">{stats.available}</p>
                    <p className="text-xs opacity-75 mt-1">ready to book</p>
                  </div>
                  <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 dark:from-yellow-600 dark:to-yellow-700 rounded-lg p-4 text-white shadow-lg">
                    <p className="text-sm font-medium opacity-90">Maintenance</p>
                    <p className="text-3xl font-bold">{stats.maintenance}</p>
                    <p className="text-xs opacity-75 mt-1">in service</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700 rounded-lg p-4 text-white shadow-lg">
                    <p className="text-sm font-medium opacity-90">This Month Revenue</p>
                    <p className="text-3xl font-bold">₱{revenue.totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                    <p className="text-xs opacity-75 mt-1">{revenue.totalBookings} bookings</p>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Notifications Panel */}
          {showNotifications && notifications.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="text-xl">🔔</span>
                  Upcoming Events ({notifications.length})
                </h3>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {notifications.map((notification, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border-l-4 ${
                      notification.type === 'checkin' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' :
                      notification.type === 'checkout' ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' :
                      notification.type === 'maintenance' ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' :
                      'border-red-500 bg-red-50 dark:bg-red-900/20'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {notification.date.toLocaleDateString()} at {notification.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </p>
                      </div>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        notification.type === 'checkin' ? 'bg-blue-200 dark:bg-blue-900 text-blue-800 dark:text-blue-300' :
                        notification.type === 'checkout' ? 'bg-orange-200 dark:bg-orange-900 text-orange-800 dark:text-orange-300' :
                        notification.type === 'maintenance' ? 'bg-yellow-200 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300' :
                        'bg-red-200 dark:bg-red-900 text-red-800 dark:text-red-300'
                      }`}>
                        {notification.type.charAt(0).toUpperCase() + notification.type.slice(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search and Filter */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1 min-w-[250px]">
                <input
                  type="text"
                  placeholder="Search by guest name, room, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="all">All Events</option>
                <option value="checkin">Check-ins Only</option>
                <option value="checkout">Checkouts Only</option>
                <option value="maintenance">Maintenance Only</option>
              </select>
              <button
                onClick={() => setShowMaintenance(!showMaintenance)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  showMaintenance
                    ? 'bg-yellow-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                }`}
              >
                {showMaintenance ? '✓ Maintenance Visible' : '✗ Maintenance Hidden'}
              </button>
            </div>
          </div>
        </div>

        {/* Conditional rendering for calendar vs week vs room grid */}
        {viewMode === 'calendar' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Calendar - Left Side */}
          <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={previousMonth}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={nextMonth}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-3">
              {dayNames.map((day) => (
                <div key={day} className="text-center font-semibold text-xs text-gray-700 dark:text-gray-300 py-2">
                  {day}
                </div>
              ))}

              {Array.from({ length: startingDayOfWeek }).map((_, index) => (
                <div key={`empty-${index}`} className="p-1"></div>
              ))}

              {Array.from({ length: daysInMonth }).map((_, index) => {
                const day = index + 1;
                const hasBookings = bookingsByDay[day.toString()];
                const hasCheckouts = checkoutsByDay[day.toString()];
                const hasMaintenance = maintenanceByDay[day.toString()];
                const isToday = day === new Date().getDate() &&
                               currentDate.getMonth() === new Date().getMonth() &&
                               currentDate.getFullYear() === new Date().getFullYear();

                return (
                  <div
                    key={day}
                    onClick={() => setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
                    onMouseEnter={() => setHoveredDate(day.toString())}
                    onMouseLeave={() => setHoveredDate(null)}
                    className={`p-2 text-center cursor-pointer rounded transition-all text-xs min-h-[80px] flex flex-col justify-between border ${
                          isToday
                            ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold'
                            : selectedDate && selectedDate.getDate() === day && selectedDate.getMonth() === currentDate.getMonth() && selectedDate.getFullYear() === currentDate.getFullYear()
                            ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700'
                        }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className={`text-xs font-bold ${isToday ? 'text-blue-700 dark:text-blue-300' : selectedDate && selectedDate.getDate() === day ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-gray-200'}`}>
                        {day}
                      </div>
                      {getDailyRevenue(day) > 0 && (
                        <div className="text-xs font-semibold text-green-600 dark:text-green-400">
                          ₱{(getDailyRevenue(day) / 1000).toFixed(0)}K
                        </div>
                      )}
                    </div>
                    <div className="flex justify-center gap-1">
                      {hasBookings && hasBookings.length > 0 && <div className="w-2 h-2 bg-blue-500 rounded-full"></div>}
                      {hasCheckouts && hasCheckouts.length > 0 && <div className="w-2 h-2 bg-orange-500 rounded-full"></div>}
                      {hasMaintenance && hasMaintenance.length > 0 && showMaintenance && <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>}
                    </div>
                    {hoveredDate === day.toString() && (
                      <div className="text-xs font-medium opacity-75 mt-1">
                        {getOccupancyPercentage(day)}% full
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Check-ins</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <span>Checkouts</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span>Maintenance</span>
              </div>
            </div>
          </div>

          {/* Details Panel - Right Side */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            {selectedDate ? (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {monthNames[selectedDate.getMonth()]} {selectedDate.getDate()}, {selectedDate.getFullYear()}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                    {dayNames[selectedDate.getDay()]}
                  </p>
                </div>

                <div className="space-y-6">
                  {/* Check-ins Section */}
                  {bookingsByDay[selectedDate.getDate().toString()] && bookingsByDay[selectedDate.getDate().toString()].length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-400 mb-3 flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        Check-ins ({bookingsByDay[selectedDate.getDate().toString()].length})
                      </h3>
                      <div className="space-y-2">
                        {bookingsByDay[selectedDate.getDate().toString()].map((booking) => {
                          const alerts = getAlerts(booking);
                          return (
                            <div key={booking.id} className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                              <div className="flex justify-between items-start mb-3">
                                <div>
                                  <p className="font-semibold text-gray-900 dark:text-white">{booking.name}</p>
                                  <p className="text-sm text-gray-600 dark:text-gray-400">Room {booking.room} • {booking.guests} {booking.guests === 1 ? 'guest' : 'guests'}</p>
                                </div>
                                <span className="px-3 py-1 bg-blue-200 dark:bg-blue-900 text-blue-800 dark:text-blue-300 text-xs font-semibold rounded-full">Check-in</span>
                              </div>

                              {/* Alerts */}
                              {alerts.length > 0 && (
                                <div className="mb-3 space-y-1">
                                  {alerts.map((alert, idx) => (
                                    <p key={idx} className="text-xs font-semibold text-red-600 dark:text-red-400">⚠️ {alert}</p>
                                  ))}
                                </div>
                              )}

                              {/* Contact Info */}
                              <div className="bg-white dark:bg-gray-700/50 rounded p-3 mb-3 space-y-1 text-sm">
                                {booking.email && (
                                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                    <span>📧</span>
                                    <a href={`mailto:${booking.email}`} className="text-blue-600 dark:text-blue-400 hover:underline truncate">{booking.email}</a>
                                  </div>
                                )}
                                {booking.phone && (
                                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                    <span>📞</span>
                                    <a href={`tel:${booking.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">{booking.phone}</a>
                                  </div>
                                )}
                              </div>

                              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                Checkout: {new Date(booking.checkOut).toLocaleDateString()}
                              </p>

                              {/* Quick Action Buttons */}
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setSelectedBooking(booking)}
                                  className="flex-1 px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded transition-colors"
                                >
                                  ✓ Check In
                                </button>
                                <button
                                  className="flex-1 px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white text-xs font-semibold rounded transition-colors"
                                >
                                  📝 Add Note
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Checkouts Section */}
                  {checkoutsByDay[selectedDate.getDate().toString()] && checkoutsByDay[selectedDate.getDate().toString()].length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-orange-700 dark:text-orange-400 mb-3 flex items-center gap-2">
                        <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                        Checkouts ({checkoutsByDay[selectedDate.getDate().toString()].length})
                      </h3>
                      <div className="space-y-2">
                        {checkoutsByDay[selectedDate.getDate().toString()].map((booking) => (
                          <div key={booking.id} className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <p className="font-semibold text-gray-900 dark:text-white">{booking.name}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Room {booking.room} • {booking.guests} {booking.guests === 1 ? 'guest' : 'guests'}</p>
                              </div>
                              <span className="px-3 py-1 bg-orange-200 dark:bg-orange-900 text-orange-800 dark:text-orange-300 text-xs font-semibold rounded-full">Checkout</span>
                            </div>

                            {/* Contact Info */}
                            <div className="bg-white dark:bg-gray-700/50 rounded p-3 mb-3 space-y-1 text-sm">
                              {booking.email && (
                                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                  <span>📧</span>
                                  <a href={`mailto:${booking.email}`} className="text-blue-600 dark:text-blue-400 hover:underline truncate">{booking.email}</a>
                                </div>
                              )}
                              {booking.phone && (
                                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                  <span>📞</span>
                                  <a href={`tel:${booking.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">{booking.phone}</a>
                                </div>
                              )}
                            </div>

                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                              Check-in: {new Date(booking.checkIn).toLocaleDateString()}
                            </p>

                            {/* Quick Action Buttons */}
                            <div className="flex gap-2">
                              <button
                                onClick={() => setSelectedBooking(booking)}
                                className="flex-1 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded transition-colors"
                              >
                                ✓ Check Out
                              </button>
                              <button
                                className="flex-1 px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white text-xs font-semibold rounded transition-colors"
                              >
                                📝 Add Note
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Maintenance Section */}
                  {maintenanceByDay[selectedDate.getDate().toString()] && maintenanceByDay[selectedDate.getDate().toString()].length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-yellow-700 dark:text-yellow-400 mb-3 flex items-center gap-2">
                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                        Maintenance ({maintenanceByDay[selectedDate.getDate().toString()].length})
                      </h3>
                      <div className="space-y-2">
                        {maintenanceByDay[selectedDate.getDate().toString()].map((task) => (
                          <div key={task.id} className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <p className="font-semibold text-gray-900 dark:text-white">{task.title}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Room {task.room}</p>
                              </div>
                              <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                                task.priority === 'high' ? 'bg-red-200 dark:bg-red-900 text-red-800 dark:text-red-300' :
                                task.priority === 'medium' ? 'bg-yellow-200 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300' :
                                'bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-300'
                              }`}>
                                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                              Due: {new Date(task.dueDate).toLocaleDateString()}
                            </p>
                            {/* Quick Action Buttons */}
                            <div className="flex gap-2">
                              <button
                                onClick={() => setSelectedMaintenance(task)}
                                className="flex-1 px-3 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-semibold rounded transition-colors"
                              >
                                ✓ Complete
                              </button>
                              <button
                                className="flex-1 px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white text-xs font-semibold rounded transition-colors"
                              >
                                📝 Update
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!bookingsByDay[selectedDate.getDate().toString()] &&
                   !checkoutsByDay[selectedDate.getDate().toString()] &&
                   !maintenanceByDay[selectedDate.getDate().toString()] && (
                    <div className="text-center py-12">
                      <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-gray-600 dark:text-gray-400 font-medium">No bookings or maintenance scheduled</p>
                      <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">This day is completely free</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-gray-600 dark:text-gray-400 font-medium">Select a date to view details</p>
                <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">Click on any date in the calendar to see bookings and maintenance</p>
              </div>
            )}
          </div>
        </div>
        ) : viewMode === 'week' ? (
          <div>Week View Coming Soon</div>
        ) : viewMode === 'room-grid' ? (
          <div>Room Grid View Coming Soon</div>
        ) : null}
      </AdminMainContent>
    </div>
  );
}
