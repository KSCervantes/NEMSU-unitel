"use client";
export const dynamic = "force-dynamic";



import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminMainContent from '../components/AdminMainContent';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';

interface RoomStats {
  [key: string]: number;
}

interface StatusStats {
  pending: number;
  confirmed: number;
  cancelled: number;
  completed: number;
}

export default function Analytics() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useProtectedAdminPage();
  const [roomStats, setRoomStats] = useState<RoomStats>({});
  const [statusStats, setStatusStats] = useState<StatusStats>({ pending: 0, confirmed: 0, cancelled: 0, completed: 0 });
  const [totalBookings, setTotalBookings] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // Real-time listener for bookings
    const bookingsQuery = query(collection(db, 'bookings'));
    const unsubscribe = onSnapshot(bookingsQuery, (snapshot) => {
      const roomCounts: RoomStats = {};
      const statusCounts = { pending: 0, confirmed: 0, cancelled: 0, completed: 0 };
      let revenue = 0;

      snapshot.forEach((doc) => {
        const data = doc.data();

        // Count by room type (all bookings - gives complete picture)
        if (data.room) {
          roomCounts[data.room] = (roomCounts[data.room] || 0) + 1;
        }

        // Count by status (all bookings)
        if (data.status) {
          statusCounts[data.status as keyof StatusStats] = (statusCounts[data.status as keyof StatusStats] || 0) + 1;
        }

        // Calculate revenue from confirmed bookings only
        if (data.status === 'confirmed') {
          // Payment data is stored in payment.total (from BookingModal.tsx line 382)
          // Structure: payment: { nights, guests, basePrice, extraFee, total }
          let bookingRevenue = 0;
          
          if (data.payment && typeof data.payment === 'object' && 'total' in data.payment) {
            // Primary: Use payment.total (current booking structure)
            bookingRevenue = parseFloat(data.payment.total.toString()) || 0;
          } else if (data.totalPrice) {
            // Fallback 1: totalPrice (legacy field)
            bookingRevenue = parseFloat(data.totalPrice.toString()) || 0;
          } else if (data.totalAmount) {
            // Fallback 2: totalAmount (alternative legacy field)
            bookingRevenue = parseFloat(data.totalAmount.toString()) || 0;
          }
          
          // Only add if revenue is valid and positive
          if (!isNaN(bookingRevenue) && bookingRevenue > 0) {
            revenue += bookingRevenue;
          }
        }
      });

      setRoomStats(roomCounts);
      setStatusStats(statusCounts);
      setTotalBookings(snapshot.size);
      setTotalRevenue(revenue);
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1a3a52' }}>
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Colors for charts
  const roomColors = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'];
  const statusColors = { pending: '#F59E0B', confirmed: '#10B981', cancelled: '#EF4444' };

  // Calculate max value for bar chart scaling
  const roomValues = Object.values(roomStats);
  const maxRoomValue = Math.max(...roomValues, 1);
  const totalStatus = statusStats.pending + statusStats.confirmed + statusStats.cancelled + statusStats.completed || 1;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <Header />

      <AdminMainContent>
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            Analytics
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
            Comprehensive insights and data visualization
          </p>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Bar Chart - Room Bookings */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Room Bookings</h3>
            <div className="flex items-end justify-around h-48 px-4">
              {Object.entries(roomStats).map(([room, count], idx) => {
                const height = (count / maxRoomValue) * 100;
                const color = roomColors[idx % roomColors.length];
                return (
                  <div key={room} className="flex flex-col items-center gap-2 flex-1 max-w-20">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{count}</div>
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${height}%`,
                        backgroundColor: color,
                        minHeight: '20px'
                      }}
                    ></div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 text-center leading-tight mt-1">
                      {room.split(' ')[0]}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap gap-2 justify-center">
                {Object.entries(roomStats).map(([room, count], idx) => (
                  <div key={room} className="flex items-center gap-2 px-2 py-1 bg-gray-50 dark:bg-gray-700/50 rounded text-xs">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: roomColors[idx % roomColors.length] }}
                    ></div>
                    <span className="text-gray-700 dark:text-gray-300">{room}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pie Chart - Booking Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Booking Status</h3>
            <div className="flex items-center justify-center h-64">
              <div className="relative w-52 h-52">
                <svg viewBox="0 0 100 100" className="transform -rotate-90">
                  {(() => {
                    let currentAngle = 0;
                    return Object.entries(statusStats).map(([status, count]) => {
                      const percentage = (count / totalStatus) * 100;
                      const angle = (percentage / 100) * 360;
                      const startAngle = currentAngle;
                      currentAngle += angle;

                      // Calculate arc path
                      const radius = 40;
                      const centerX = 50;
                      const centerY = 50;
                      const startRad = (startAngle * Math.PI) / 180;
                      const endRad = (currentAngle * Math.PI) / 180;

                      const x1 = centerX + radius * Math.cos(startRad);
                      const y1 = centerY + radius * Math.sin(startRad);
                      const x2 = centerX + radius * Math.cos(endRad);
                      const y2 = centerY + radius * Math.sin(endRad);

                      const largeArc = angle > 180 ? 1 : 0;

                      return (
                        <path
                          key={status}
                          d={`M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                          fill={statusColors[status as keyof StatusStats]}
                          className="hover:opacity-90 transition-all duration-300 cursor-pointer hover:drop-shadow-lg"
                          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
                        />
                      );
                    });
                  })()}
                  {/* Center white circle */}
                  <circle cx="50" cy="50" r="20" fill="white" stroke="#e5e7eb" strokeWidth="0.5" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-gray-900 dark:text-white">{totalBookings}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total</div>
                  </div>
                </div>
              </div>
            </div>
            {/* Legend */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap gap-3 justify-center">
                {Object.entries(statusStats).map(([status, count]) => (
                  <div key={status} className="flex items-center gap-2 px-2 py-1 bg-gray-50 dark:bg-gray-700/50 rounded text-xs">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: statusColors[status as keyof StatusStats] }}
                    ></div>
                    <span className="text-gray-700 dark:text-gray-300 capitalize">{status}</span>
                    <span className="text-gray-500 dark:text-gray-400">({count})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Donut Chart - Room Distribution */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Room Distribution</h3>
            <div className="flex items-center justify-center h-64">
              <div className="relative w-48 h-48">
                <svg viewBox="0 0 100 100" className="transform -rotate-90">
                  {(() => {
                    let currentAngle = 0;
                    const totalRooms = Object.values(roomStats).reduce((a, b) => a + b, 0) || 1;
                    return Object.entries(roomStats).map(([room, count], idx) => {
                      const percentage = (count / totalRooms) * 100;
                      const angle = (percentage / 100) * 360;
                      const startAngle = currentAngle;
                      currentAngle += angle;

                      const outerRadius = 40;
                      const innerRadius = 25;
                      const centerX = 50;
                      const centerY = 50;

                      const startRad = (startAngle * Math.PI) / 180;
                      const endRad = (currentAngle * Math.PI) / 180;

                      const x1Outer = centerX + outerRadius * Math.cos(startRad);
                      const y1Outer = centerY + outerRadius * Math.sin(startRad);
                      const x2Outer = centerX + outerRadius * Math.cos(endRad);
                      const y2Outer = centerY + outerRadius * Math.sin(endRad);

                      const x1Inner = centerX + innerRadius * Math.cos(startRad);
                      const y1Inner = centerY + innerRadius * Math.sin(startRad);
                      const x2Inner = centerX + innerRadius * Math.cos(endRad);
                      const y2Inner = centerY + innerRadius * Math.sin(endRad);

                      const largeArc = angle > 180 ? 1 : 0;

                      return (
                        <path
                          key={room}
                          d={`M ${x1Outer} ${y1Outer} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2Outer} ${y2Outer} L ${x2Inner} ${y2Inner} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1Inner} ${y1Inner} Z`}
                          fill={roomColors[idx % roomColors.length]}
                          className="hover:opacity-80 transition-opacity cursor-pointer"
                        />
                      );
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-gray-900 dark:text-white">{Object.values(roomStats).reduce((a, b) => a + b, 0)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Rooms</div>
                  </div>
                </div>
              </div>
            </div>
            {/* Legend */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(roomStats).map(([room, count], idx) => (
                  <div key={room} className="flex items-center gap-2 px-2 py-1 bg-gray-50 dark:bg-gray-700/50 rounded text-xs">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: roomColors[idx % roomColors.length] }}
                    ></div>
                    <span className="text-gray-700 dark:text-gray-300 truncate">{room}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Histogram - Bookings by Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Status Distribution</h3>
            <div className="flex items-end justify-around h-48 px-4">
              {Object.entries(statusStats).map(([status, count]) => {
                const height = (count / Math.max(...Object.values(statusStats), 1)) * 100;
                return (
                  <div key={status} className="flex flex-col items-center gap-2 flex-1 max-w-[100px]">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{count}</div>
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${height}%`,
                        backgroundColor: statusColors[status as keyof StatusStats],
                        minHeight: '20px'
                      }}
                    ></div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 capitalize mt-1">
                      {status}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Bookings</div>
            <div className="text-3xl font-semibold text-gray-900 dark:text-white">{totalBookings}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Revenue</div>
            <div className="text-3xl font-semibold text-gray-900 dark:text-white">₱{totalRevenue.toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Confirmed</div>
            <div className="text-3xl font-semibold text-gray-900 dark:text-white">{statusStats.confirmed}</div>
          </div>
        </div>
      </AdminMainContent>
    </div>
  );
}
