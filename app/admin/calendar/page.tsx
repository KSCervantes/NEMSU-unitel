"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from 'react';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminMainContent from '../components/AdminMainContent';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';
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
  dueDate: string;
  priority: string;
}

export default function Calendar() {
  const { isAuthenticated, isLoading } = useProtectedAdminPage();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [bookingsByDay, setBookingsByDay] = useState<{ [key: string]: Booking[] }>({});
  const [checkoutsByDay, setCheckoutsByDay] = useState<{ [key: string]: Booking[] }>({});
  const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>([]);
  const [maintenanceByDay, setMaintenanceByDay] = useState<{ [key: string]: MaintenanceTask[] }>({});
  const [showMaintenance, setShowMaintenance] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchBookings = useCallback(async () => {
    try {
      const roomsRef = collection(db, 'rooms');
      const roomsSnapshot = await getDocs(roomsRef);
      const roomsData: Room[] = [];
      roomsSnapshot.forEach((doc) => {
        roomsData.push({ id: doc.id, ...doc.data() } as Room);
      });
      setAllRooms(roomsData);

      const bookingsRef = collection(db, 'bookings');
      const snapshot = await getDocs(bookingsRef);
      const bookingsData: Booking[] = [];
      snapshot.forEach((doc) => {
        bookingsData.push({ id: doc.id, ...doc.data() } as Booking);
      });

      setAllBookings(bookingsData);
      processBookingsByMonth(bookingsData, currentDate);

      const maintenanceRef = collection(db, 'maintenance');
      const maintenanceSnapshot = await getDocs(maintenanceRef);
      const maintenanceData: MaintenanceTask[] = [];
      maintenanceSnapshot.forEach((doc) => {
        maintenanceData.push({ id: doc.id, ...doc.data() } as MaintenanceTask);
      });

      setMaintenanceTasks(maintenanceData);
      processMaintenanceByMonth(maintenanceData, currentDate);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    }
  }, [currentDate]);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      fetchBookings();
    }
  }, [fetchBookings, isAuthenticated, isLoading]);

  const processBookingsByMonth = (bookings: Booking[], date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const dayBookings: { [key: string]: Booking[] } = {};
    const dayCheckouts: { [key: string]: Booking[] } = {};

    const activeBookings = bookings.filter(b =>
      b.status === 'confirmed' || b.status === 'in-progress'
    );

    activeBookings.forEach((booking) => {
      const checkInDate = new Date(booking.checkIn);
      const checkOutDate = new Date(booking.checkOut);

      if (checkInDate.getFullYear() === year && checkInDate.getMonth() === month) {
        const day = checkInDate.getDate().toString();
        if (!dayBookings[day]) dayBookings[day] = [];
        dayBookings[day].push(booking);
      }

      if (checkOutDate.getFullYear() === year && checkOutDate.getMonth() === month) {
        const day = checkOutDate.getDate().toString();
        if (!dayCheckouts[day]) dayCheckouts[day] = [];
        dayCheckouts[day].push(booking);
      }
    });

    setBookingsByDay(dayBookings);
    setCheckoutsByDay(dayCheckouts);
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

  useEffect(() => {
    if (allBookings.length > 0) {
      processBookingsByMonth(allBookings, currentDate);
    }
    if (maintenanceTasks.length > 0) {
      processMaintenanceByMonth(maintenanceTasks, currentDate);
    }
  }, [allBookings, currentDate, maintenanceTasks]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getDailyRevenue = (day: number): number => {
    // Function kept for future revenue calculations
    return 0;
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    return { daysInMonth, startingDayOfWeek };
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const getOccupancyStats = () => {
    const today = new Date().toISOString().split('T')[0];
    const occupiedRooms = new Set<string>();

    allBookings.forEach(booking => {
      const checkIn = new Date(booking.checkIn).toISOString().split('T')[0];
      const checkOut = new Date(booking.checkOut).toISOString().split('T')[0];
      if (checkIn <= today && checkOut > today && booking.status === 'confirmed') {
        occupiedRooms.add(booking.room);
      }
    });

    const totalRooms = allRooms.length || 1;
    const occupied = occupiedRooms.size;
    const available = totalRooms - occupied;
    const occupancyPercentage = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;

    return { occupied, available, totalRooms, occupancyPercentage };
  };

  // Action Handlers
  const handleCheckIn = async (booking: Booking) => {
    const result = await Swal.fire({
      title: 'Confirm Check-in',
      html: `<div class="text-left"><p><strong>${booking.name}</strong></p><p>Room: ${booking.room}</p><p>Guests: ${booking.guests || 1}</p></div>`,
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
        const bookingRef = doc(db, 'bookings', booking.id);
        await updateDoc(bookingRef, {
          status: 'in-progress',
          checkInTime: Timestamp.now(),
          updatedAt: Timestamp.now()
        });

        // Update local state
        setAllBookings(prev => prev.map(b =>
          b.id === booking.id ? { ...b, status: 'in-progress' } : b
        ));

        Swal.fire({
          title: 'Success!',
          text: `${booking.name} has checked in to Room ${booking.room}`,
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
      html: `<div class="text-left"><p><strong>${booking.name}</strong></p><p>Room: ${booking.room}</p><p>Total Amount: ₱${parseFloat(booking.totalPrice?.toString() || '0').toLocaleString('en-PH')}</p></div>`,
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
        const bookingRef = doc(db, 'bookings', booking.id);
        await updateDoc(bookingRef, {
          status: 'completed',
          checkOutTime: Timestamp.now(),
          updatedAt: Timestamp.now()
        });

        // Update local state
        setAllBookings(prev => prev.map(b =>
          b.id === booking.id ? { ...b, status: 'completed' } : b
        ));

        Swal.fire({
          title: 'Success!',
          text: `${booking.name} has checked out from Room ${booking.room}`,
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
        const taskRef = doc(db, 'maintenance', task.id);
        await updateDoc(taskRef, {
          status: 'completed',
          completedAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });

        // Update local state
        setMaintenanceTasks(prev => prev.map(t =>
          t.id === task.id ? { ...t, status: 'completed' } : t
        ));

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

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1a3a52' }}>
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate);
  const stats = getOccupancyStats();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <Header />

      <AdminMainContent>
        <div className="mb-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Calendar</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your bookings at a glance</p>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-blue-500">
              <p className="text-sm text-gray-600 dark:text-gray-400">Occupied Rooms</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.occupied}/{stats.totalRooms}</p>
              <p className="text-xs text-gray-500 mt-2">{stats.occupancyPercentage}% occupancy</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-green-500">
              <p className="text-sm text-gray-600 dark:text-gray-400">Available Rooms</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.available}</p>
              <p className="text-xs text-gray-500 mt-2">Ready to book</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-orange-500">
              <p className="text-sm text-gray-600 dark:text-gray-400">This Month</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{allBookings.filter(b => b.status !== 'completed').length}</p>
              <p className="text-xs text-gray-500 mt-2">Active bookings</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-purple-500">
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Rooms</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.totalRooms}</p>
              <p className="text-xs text-gray-500 mt-2">In system</p>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={previousMonth}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={nextMonth}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Days of week */}
              <div className="grid grid-cols-7 gap-1 mb-3">
                {dayNames.map((day) => (
                  <div key={day} className="text-center font-semibold text-xs text-gray-600 dark:text-gray-400 py-2">
                    {day}
                  </div>
                ))}

                {/* Empty cells */}
                {Array.from({ length: startingDayOfWeek }).map((_, index) => (
                  <div key={`empty-${index}`} className="p-2"></div>
                ))}

                {/* Days */}
                {Array.from({ length: daysInMonth }).map((_, index) => {
                  const day = index + 1;
                  const hasBookings = bookingsByDay[day.toString()]?.length > 0;
                  const hasCheckouts = checkoutsByDay[day.toString()]?.length > 0;
                  const hasMaintenance = maintenanceByDay[day.toString()]?.length > 0;
                  const isToday = day === new Date().getDate() &&
                                 currentDate.getMonth() === new Date().getMonth() &&
                                 currentDate.getFullYear() === new Date().getFullYear();
                  const isSelected = selectedDate?.getDate() === day &&
                                   selectedDate?.getMonth() === currentDate.getMonth() &&
                                   selectedDate?.getFullYear() === currentDate.getFullYear();

                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
                      className={`p-2 text-sm font-semibold rounded-lg transition relative min-h-[50px] flex items-center justify-center ${
                        isToday
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 ring-2 ring-blue-400'
                          : isSelected
                          ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-400'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-300'
                      }`}
                    >
                      <div className="relative w-full h-full flex items-center justify-center">
                        {day}
                        {(hasBookings || hasCheckouts || hasMaintenance) && (
                          <div className="absolute bottom-1 flex gap-0.5">
                            {hasBookings && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>}
                            {hasCheckouts && <div className="w-1.5 h-1.5 bg-orange-500 rounded-full"></div>}
                            {hasMaintenance && showMaintenance && <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-gray-600 dark:text-gray-400">Check-in</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  <span className="text-gray-600 dark:text-gray-400">Check-out</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span className="text-gray-600 dark:text-gray-400">Maintenance</span>
                </div>
                <button
                  onClick={() => setShowMaintenance(!showMaintenance)}
                  className={`w-full mt-3 px-2 py-1 rounded text-xs font-medium transition ${
                    showMaintenance
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
                  }`}
                >
                  {showMaintenance ? '✓ Maintenance Visible' : '✗ Maintenance Hidden'}
                </button>
              </div>
            </div>
          </div>

          {/* Bookings Details */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              {selectedDate ? (
                <>
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {monthNames[selectedDate.getMonth()]} {selectedDate.getDate()}, {selectedDate.getFullYear()}
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{dayNames[selectedDate.getDay()]}</p>
                  </div>

                  {/* Daily Stats */}
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Check-ins</p>
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{bookingsByDay[selectedDate.getDate().toString()]?.length || 0}</p>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-900/30 p-3 rounded-lg border border-orange-200 dark:border-orange-800">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Check-outs</p>
                      <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{checkoutsByDay[selectedDate.getDate().toString()]?.length || 0}</p>
                    </div>
                    <div className="bg-yellow-50 dark:bg-yellow-900/30 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Maintenance</p>
                      <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{maintenanceByDay[selectedDate.getDate().toString()]?.length || 0}</p>
                    </div>
                  </div>

                  {/* Bookings List */}
                  <div className="space-y-4">
                    {bookingsByDay[selectedDate.getDate().toString()]?.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          Check-ins ({bookingsByDay[selectedDate.getDate().toString()].length})
                        </h3>
                        <div className="space-y-2">
                          {bookingsByDay[selectedDate.getDate().toString()].map((booking) => (
                            <div key={booking.id} className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex-1">
                                  <p className="font-semibold text-gray-900 dark:text-white text-lg">{booking.name}</p>
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Room {booking.room} • {booking.guests || 1} guest(s)</p>
                                </div>
                                <span className="px-2 py-1 bg-blue-200 dark:bg-blue-900 text-blue-800 dark:text-blue-300 text-xs font-semibold rounded whitespace-nowrap ml-2">
                                  Check In
                                </span>
                              </div>

                              {/* Check-in Details */}
                              <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                                <div className="bg-white dark:bg-gray-700/50 rounded p-2">
                                  <p className="text-gray-500 dark:text-gray-400">Check-in Date</p>
                                  <p className="font-semibold text-gray-900 dark:text-white">{new Date(booking.checkIn).toLocaleDateString()}</p>
                                </div>
                                <div className="bg-white dark:bg-gray-700/50 rounded p-2">
                                  <p className="text-gray-500 dark:text-gray-400">Check-out Date</p>
                                  <p className="font-semibold text-gray-900 dark:text-white">{new Date(booking.checkOut).toLocaleDateString()}</p>
                                </div>
                              </div>

                              {/* Contact Information */}
                              <div className="bg-white dark:bg-gray-700/50 rounded p-3 mb-3 space-y-2 text-xs">
                                {booking.email && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-blue-600 dark:text-blue-400">📧</span>
                                    <a href={`mailto:${booking.email}`} className="text-blue-600 dark:text-blue-400 hover:underline truncate">{booking.email}</a>
                                  </div>
                                )}
                                {booking.phone && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-green-600 dark:text-green-400">📞</span>
                                    <a href={`tel:${booking.phone}`} className="text-green-600 dark:text-green-400 hover:underline">{booking.phone}</a>
                                  </div>
                                )}
                              </div>

                              {/* Booking Info */}
                              <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                                <div className="bg-white dark:bg-gray-700/50 rounded p-2">
                                  <p className="text-gray-500 dark:text-gray-400">Status</p>
                                  <p className="font-semibold text-gray-900 dark:text-white capitalize">{booking.status}</p>
                                </div>
                                {booking.totalPrice && (
                                  <div className="bg-white dark:bg-gray-700/50 rounded p-2">
                                    <p className="text-gray-500 dark:text-gray-400">Total Price</p>
                                    <p className="font-semibold text-green-600 dark:text-green-400">₱{parseFloat(booking.totalPrice.toString()).toLocaleString('en-PH')}</p>
                                  </div>
                                )}
                              </div>

                              {/* Duration */}
                              <div className="bg-white dark:bg-gray-700/50 rounded p-2 text-xs mb-3">
                                <p className="text-gray-500 dark:text-gray-400">Duration</p>
                                <p className="font-semibold text-gray-900 dark:text-white">
                                  {Math.ceil((new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / (1000 * 60 * 60 * 24))} night(s)
                                </p>
                              </div>

                              {/* Action Button */}
                              <button
                                onClick={() => handleCheckIn(booking)}
                                disabled={isProcessing || booking.status === 'in-progress'}
                                className={`w-full px-3 py-2 rounded-lg font-semibold text-sm transition-colors ${
                                  booking.status === 'in-progress'
                                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                    : isProcessing
                                    ? 'bg-blue-400 dark:bg-blue-600 text-white opacity-50 cursor-not-allowed'
                                    : 'bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 dark:hover:bg-blue-800'
                                }`}
                              >
                                {isProcessing ? 'Processing...' : booking.status === 'in-progress' ? '✓ Checked In' : '✓ Check In'}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {checkoutsByDay[selectedDate.getDate().toString()]?.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                          <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                          Check-outs ({checkoutsByDay[selectedDate.getDate().toString()].length})
                        </h3>
                        <div className="space-y-2">
                          {checkoutsByDay[selectedDate.getDate().toString()].map((booking) => (
                            <div key={booking.id} className="border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex-1">
                                  <p className="font-semibold text-gray-900 dark:text-white text-lg">{booking.name}</p>
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Room {booking.room} • {booking.guests || 1} guest(s)</p>
                                </div>
                                <span className="px-2 py-1 bg-orange-200 dark:bg-orange-900 text-orange-800 dark:text-orange-300 text-xs font-semibold rounded whitespace-nowrap ml-2">
                                  Check Out
                                </span>
                              </div>

                              {/* Stay Duration */}
                              <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                                <div className="bg-white dark:bg-gray-700/50 rounded p-2">
                                  <p className="text-gray-500 dark:text-gray-400">Check-in Date</p>
                                  <p className="font-semibold text-gray-900 dark:text-white">{new Date(booking.checkIn).toLocaleDateString()}</p>
                                </div>
                                <div className="bg-white dark:bg-gray-700/50 rounded p-2">
                                  <p className="text-gray-500 dark:text-gray-400">Check-out Date</p>
                                  <p className="font-semibold text-gray-900 dark:text-white">{new Date(booking.checkOut).toLocaleDateString()}</p>
                                </div>
                              </div>

                              {/* Contact Information */}
                              <div className="bg-white dark:bg-gray-700/50 rounded p-3 mb-3 space-y-2 text-xs">
                                {booking.email && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-blue-600 dark:text-blue-400">📧</span>
                                    <a href={`mailto:${booking.email}`} className="text-blue-600 dark:text-blue-400 hover:underline truncate">{booking.email}</a>
                                  </div>
                                )}
                                {booking.phone && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-green-600 dark:text-green-400">📞</span>
                                    <a href={`tel:${booking.phone}`} className="text-green-600 dark:text-green-400 hover:underline">{booking.phone}</a>
                                  </div>
                                )}
                              </div>

                              {/* Booking Info */}
                              <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                                <div className="bg-white dark:bg-gray-700/50 rounded p-2">
                                  <p className="text-gray-500 dark:text-gray-400">Status</p>
                                  <p className="font-semibold text-gray-900 dark:text-white capitalize">{booking.status}</p>
                                </div>
                                {booking.totalPrice && (
                                  <div className="bg-white dark:bg-gray-700/50 rounded p-2">
                                    <p className="text-gray-500 dark:text-gray-400">Total Price</p>
                                    <p className="font-semibold text-green-600 dark:text-green-400">₱{parseFloat(booking.totalPrice.toString()).toLocaleString('en-PH')}</p>
                                  </div>
                                )}
                              </div>

                              {/* Duration */}
                              <div className="bg-white dark:bg-gray-700/50 rounded p-2 text-xs mb-3">
                                <p className="text-gray-500 dark:text-gray-400">Duration</p>
                                <p className="font-semibold text-gray-900 dark:text-white">
                                  {Math.ceil((new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / (1000 * 60 * 60 * 24))} night(s)
                                </p>
                              </div>

                              {/* Action Button */}
                              <button
                                onClick={() => handleCheckOut(booking)}
                                disabled={isProcessing || booking.status === 'completed'}
                                className={`w-full px-3 py-2 rounded-lg font-semibold text-sm transition-colors ${
                                  booking.status === 'completed'
                                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                    : isProcessing
                                    ? 'bg-orange-400 dark:bg-orange-600 text-white opacity-50 cursor-not-allowed'
                                    : 'bg-orange-600 dark:bg-orange-700 text-white hover:bg-orange-700 dark:hover:bg-orange-800'
                                }`}
                              >
                                {isProcessing ? 'Processing...' : booking.status === 'completed' ? '✓ Checked Out' : '✓ Check Out'}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {maintenanceByDay[selectedDate.getDate().toString()]?.length > 0 && showMaintenance && (
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                          <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                          Maintenance ({maintenanceByDay[selectedDate.getDate().toString()].length})
                        </h3>
                        <div className="space-y-2">
                          {maintenanceByDay[selectedDate.getDate().toString()].map((task) => (
                            <div key={task.id} className="border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="font-semibold text-gray-900 dark:text-white">{task.title}</p>
                                  <p className="text-sm text-gray-600 dark:text-gray-400">Room {task.room}</p>
                                </div>
                                <span className={`px-2 py-1 text-xs font-semibold rounded ${
                                  task.priority === 'high' ? 'bg-red-200 dark:bg-red-900 text-red-800 dark:text-red-300' :
                                  task.priority === 'medium' ? 'bg-yellow-200 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300' :
                                  'bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-300'
                                }`}>
                                  {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} Priority
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                                Due: {new Date(task.dueDate).toLocaleDateString()}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 mb-3">
                                Status: {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                              </p>

                              {/* Action Button */}
                              <button
                                onClick={() => handleMaintenanceComplete(task)}
                                disabled={isProcessing || task.status === 'completed'}
                                className={`w-full px-3 py-2 rounded-lg font-semibold text-sm transition-colors ${
                                  task.status === 'completed'
                                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                    : isProcessing
                                    ? 'bg-yellow-400 dark:bg-yellow-600 text-white opacity-50 cursor-not-allowed'
                                    : 'bg-yellow-600 dark:bg-yellow-700 text-white hover:bg-yellow-700 dark:hover:bg-yellow-800'
                                }`}
                              >
                                {isProcessing ? 'Processing...' : task.status === 'completed' ? '✓ Completed' : '✓ Mark Complete'}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!bookingsByDay[selectedDate.getDate().toString()] && !checkoutsByDay[selectedDate.getDate().toString()] && !maintenanceByDay[selectedDate.getDate().toString()] && (
                      <div className="text-center py-8">
                        <p className="text-gray-500 dark:text-gray-400">No bookings or maintenance scheduled for this date</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <svg className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-600 dark:text-gray-400 font-medium">Select a date to view bookings</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </AdminMainContent>
    </div>
  );
}
