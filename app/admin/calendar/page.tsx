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

interface Booking {
  id: string;
  name: string;
  room: string;
  checkIn: string;
  checkOut: string;
  status: string;
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
  const [bookingsByDay, setBookingsByDay] = useState<{ [key: string]: Booking[] }>({});
  const [checkoutsByDay, setCheckoutsByDay] = useState<{ [key: string]: Booking[] }>({});
  const [upcomingBookings, setUpcomingBookings] = useState<{ date: string; count: number; rooms: string[] }[]>([]);
  const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>([]);
  const [maintenanceByDay, setMaintenanceByDay] = useState<{ [key: string]: MaintenanceTask[] }>({});

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      fetchBookings();
    }
  }, [isAuthenticated, isLoading]);

  const fetchBookings = async () => {
    try {
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
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            Calendar
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
            View and manage booking schedule
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Calendar */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
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

            <div className="grid grid-cols-7 gap-2 mb-2">
              {dayNames.map((day) => (
                <div key={day} className="text-center font-semibold text-gray-700 dark:text-gray-300 py-2 bg-gray-100 dark:bg-gray-700 rounded">
                  {day}
                </div>
              ))}

              {Array.from({ length: startingDayOfWeek }).map((_, index) => (
                <div key={`empty-${index}`} className="p-4"></div>
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
                    className={`p-2 text-center cursor-pointer rounded transition-colors ${
                          isToday 
                            ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold' 
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                  >
                    <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'}`}>{day}</div>
                    <div className="flex flex-col gap-1">
                      {!hasBookings && !hasCheckouts && !hasMaintenance && (
                        <div className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                          Available
                        </div>
                      )}
                      {hasBookings && hasBookings.map((booking, idx) => (
                        <div key={`checkin-${booking.id}-${idx}`} className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 font-medium">
                          <div>RESERVED</div>
                          <div className="truncate">{booking.name}</div>
                        </div>
                      ))}
                      {hasCheckouts && hasCheckouts.map((booking, idx) => (
                        <div key={`checkout-${booking.id}-${idx}`} className="text-xs px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 font-medium">
                          <div>CHECKOUT</div>
                          <div className="truncate">{booking.name}</div>
                        </div>
                      ))}
                      {hasMaintenance && hasMaintenance.map((task, idx) => (
                        <div key={`maintenance-${task.id}-${idx}`} className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 font-medium">
                          <div>MAINTENANCE</div>
                          <div className="truncate">{task.room}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 flex-wrap bg-gray-100 dark:bg-gray-700 p-3 rounded-lg">
              <div className="flex items-center gap-2 px-2 py-1 bg-white dark:bg-gray-600 rounded">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="font-medium">Today</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-600 rounded-lg shadow-sm">
                <div className="w-4 h-4 bg-gradient-to-br from-blue-100 to-indigo-100 border border-blue-300 rounded"></div>
                <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 512 512">
                  <path d="M138.418,273.859h-15.741v-9.774h7.132c4.466,0,8.084-3.62,8.084-8.084s-3.619-8.084-8.084-8.084h-7.132v-9.775h15.741 v-0.001c4.466,0,8.084-3.62,8.084-8.084c0-4.465-3.619-8.084-8.084-8.084h-23.825c-4.466,0-8.084,3.62-8.084,8.084v51.888 c0,4.465,3.619,8.084,8.084,8.084h23.825c4.466,0,8.084-3.62,8.084-8.084S142.884,273.859,138.418,273.859z"/>
                  <path d="M175.806,247.916c-2.695,0-4.887-2.192-4.887-4.888c0-2.696,2.192-4.888,4.887-4.888h12.972 c4.466,0,8.084-3.62,8.084-8.084c0-4.465-3.618-8.084-8.084-8.084h-12.972c-11.61,0-21.056,9.446-21.056,21.057 c0,11.611,9.446,21.057,21.056,21.057c2.696,0,4.888,2.192,4.888,4.887c0,2.695-2.192,4.888-4.888,4.888h-12.971 c-4.466,0-8.084,3.62-8.084,8.084s3.619,8.084,8.084,8.084h12.971c11.61,0,21.057-9.446,21.057-21.057 C196.863,257.361,187.416,247.916,175.806,247.916z"/>
                  <path d="M239.72,273.859h-15.74v-9.774h7.132c4.466,0,8.084-3.62,8.084-8.084s-3.619-8.084-8.084-8.084h-7.132v-9.775h15.74 v-0.001c4.466,0,8.084-3.62,8.084-8.084c0-4.465-3.618-8.084-8.084-8.084h-23.825c-4.466,0-8.084,3.62-8.084,8.084v51.888 c0,4.465,3.618,8.084,8.084,8.084h23.825c4.466,0,8.084-3.62,8.084-8.084S244.186,273.859,239.72,273.859z"/>
                  <path d="M401.343,273.859h-15.74v-9.774h7.133c4.466,0,8.084-3.62,8.084-8.084s-3.618-8.084-8.084-8.084h-7.133v-9.775h15.74 v-0.001c4.466,0,8.084-3.62,8.084-8.084c0-4.465-3.618-8.084-8.084-8.084h-23.825c-4.466,0-8.084,3.62-8.084,8.084v51.888 c0,4.465,3.618,8.084,8.084,8.084h23.825c4.466,0,8.084-3.62,8.084-8.084S405.809,273.859,401.343,273.859z"/>
                  <path d="M81.35,263.232c6.355-3.934,10.611-10.949,10.611-18.957c0-12.299-10.005-22.304-22.303-22.304H53.443 c-4.466,0-8.084,3.62-8.084,8.084v51.888c0,4.465,3.618,8.084,8.084,8.084c4.466,0,8.084-3.62,8.084-8.084v-15.364h3.281 l10.23,19.172c1.455,2.727,4.25,4.279,7.14,4.279c1.283,0,2.586-0.307,3.798-0.954c3.939-2.102,5.428-7,3.326-10.938 L81.35,263.232z M69.658,250.41h-8.131v-12.271h8.131c3.384,0,6.134,2.752,6.134,6.135C75.792,247.658,73.04,250.41,69.658,250.41 z"/>
                  <path d="M294.744,263.232c6.354-3.934,10.611-10.949,10.611-18.957c0-12.299-10.005-22.304-22.303-22.304h-16.215 c-4.466,0-8.084,3.62-8.084,8.084v51.888c0,4.465,3.619,8.084,8.084,8.084c4.466,0,8.084-3.62,8.084-8.084v-15.364h3.281 l10.23,19.172c1.456,2.727,4.25,4.279,7.14,4.279c1.283,0,2.586-0.307,3.799-0.954c3.939-2.102,5.428-7,3.326-10.938 L294.744,263.232z M283.051,250.41h-8.131v-12.271h8.131c3.384,0,6.134,2.752,6.134,6.135 C289.186,247.658,286.435,250.41,283.051,250.41z"/>
                  <path d="M359.094,222.493c-4.174-1.577-8.84,0.528-10.42,4.705l-12.049,31.88l-12.05-31.88c-1.579-4.176-6.243-6.282-10.42-4.704 c-4.177,1.578-6.283,6.243-4.704,10.42l19.611,51.888c1.189,3.144,4.2,5.226,7.563,5.226s6.374-2.081,7.563-5.227l19.61-51.888 C365.377,228.736,363.271,224.071,359.094,222.493z"/>
                  <path d="M434.733,221.97h-6.435v0.001c-4.466,0-8.084,3.62-8.084,8.084v51.888c0,4.465,3.618,8.084,8.084,8.084h6.435 c17.594,0,31.909-14.314,31.909-31.909v-4.239C466.642,236.284,452.329,221.97,434.733,221.97z M450.473,258.119 c0,8.122-6.183,14.828-14.09,15.654v-35.548c7.907,0.827,14.09,7.532,14.09,15.654V258.119z"/>
                  <path d="M500.465,199.728l-2.414-29.541c-0.342-4.196-3.847-7.426-8.057-7.426H22.005c-4.209,0-7.714,3.23-8.057,7.426 L0.027,340.495c-0.184,2.251,0.581,4.477,2.113,6.136c1.531,1.661,3.685,2.606,5.945,2.606h48.509c4.466,0,8.084-3.62,8.084-8.084 s-3.62-8.084-8.084-8.084H16.855L29.455,178.93h453.089l1.809,22.115c0.364,4.45,4.253,7.769,8.716,7.399 C497.517,208.081,500.83,204.178,500.465,199.728z"/>
                  <path d="M511.973,340.494l-9.575-117.122c-0.363-4.45-4.267-7.761-8.716-7.399c-4.45,0.363-7.762,4.266-7.398,8.716l8.86,108.38 H83.54c-4.466,0-8.084,3.62-8.084,8.084s3.618,8.084,8.084,8.084h420.377c2.259,0,4.414-0.944,5.945-2.605 C511.392,344.972,512.157,342.746,511.973,340.494z"/>
                </svg>
                <span className="font-semibold">Check-ins</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-600 rounded-lg shadow-sm">
                <div className="w-4 h-4 bg-gradient-to-br from-orange-100 to-amber-100 border border-orange-300 rounded"></div>
                <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/>
                  <path d="M4.5 3a2.5 2.5 0 0 0-2.5 2.5v8A2.5 2.5 0 0 0 4.5 16h7a2.5 2.5 0 0 0 2.5-2.5v-8A2.5 2.5 0 0 0 11.5 3h-7zM3 5.5A1.5 1.5 0 0 1 4.5 4h7A1.5 1.5 0 0 1 13 5.5v8a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-8z"/>
                  <path d="M4.5 2A.5.5 0 0 1 5 1.5h6a.5.5 0 0 1 0 1h-6A.5.5 0 0 1 4.5 2z"/>
                </svg>
                <span className="font-semibold">Checkouts</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-600 rounded-lg shadow-sm">
                <div className="w-4 h-4 bg-gradient-to-br from-yellow-100 to-amber-100 border border-yellow-300 rounded"></div>
                <svg className="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
                <span className="font-semibold">Maintenance</span>
              </div>
            </div>
          </div>
        </div>
      </AdminMainContent>
    </div>
  );
}
