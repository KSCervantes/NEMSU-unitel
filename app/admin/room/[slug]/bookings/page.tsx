"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { useProtectedAdminPage } from '@/app/admin/hooks/useProtectedAdminPage';
import Sidebar from '@/app/admin/components/Sidebar';
import Header from '@/app/admin/components/Header';
import AdminMainContent from '@/app/admin/components/AdminMainContent';

interface Booking {
  id: string;
  name?: string;
  surname?: string;
  email?: string;
  mobile?: string;
  status?: string;
  checkIn?: string;
  checkOut?: string;
}

export default function RoomBookingsPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useProtectedAdminPage();
  const slug = (params?.slug as string) || '';
  const fallbackName = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [roomNameFromDoc, setRoomNameFromDoc] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    const unsubscribers: Array<() => void> = [];
    const rowsMap = new Map<string, Booking>();

    const commitRows = () => {
      const rows = Array.from(rowsMap.values());
      rows.sort((a, b) => {
        const aTime = a.checkIn ? new Date(a.checkIn).getTime() : 0;
        const bTime = b.checkIn ? new Date(b.checkIn).getTime() : 0;
        return aTime - bTime;
      });
      setBookings(rows);
    };

    void (async () => {
      let canonicalRoomName = fallbackName;
      try {
        const roomRef = doc(db, 'rooms', slug);
        const roomSnap = await getDoc(roomRef);
        if (roomSnap.exists()) {
          const data = roomSnap.data() as { name?: string };
          if (data?.name) {
            canonicalRoomName = data.name;
            setRoomNameFromDoc(data.name);
          }
        }
      } catch {
        // Ignore lookup failures and continue with fallback name.
      }

      const qBySlug = query(collection(db, 'bookings'), where('roomSlug', '==', slug));
      const qByName = query(collection(db, 'bookings'), where('room', '==', canonicalRoomName));

      type BookingDoc = {
        name?: string;
        surname?: string;
        email?: string;
        mobile?: string;
        status?: string;
        checkIn?: string;
        checkOut?: string;
      };

      const applySnapshot = (snapshot: { forEach: (cb: (item: { id: string; data: () => BookingDoc }) => void) => void }) => {
        snapshot.forEach((item) => {
          rowsMap.set(item.id, { id: item.id, ...item.data() });
        });
        commitRows();
      };

      unsubscribers.push(onSnapshot(qBySlug, applySnapshot));
      unsubscribers.push(onSnapshot(qByName, applySnapshot));
    })();

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [slug, fallbackName]);

  const getStatusBadge = (status?: string) => {
    if (status === 'confirmed') {
      return <span className="px-2.5 py-1 rounded text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Confirmed</span>;
    }
    if (status === 'pending') {
      return <span className="px-2.5 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Pending</span>;
    }
    if (status === 'completed') {
      return <span className="px-2.5 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Completed</span>;
    }
    if (status === 'cancelled') {
      return <span className="px-2.5 py-1 rounded text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">Cancelled</span>;
    }
    return <span className="px-2.5 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">Unknown</span>;
  };

  const roomTitle = roomNameFromDoc || fallbackName;

  if (!isAuthenticated || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-700 dark:text-gray-300 text-lg">Loading room bookings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <Header />

      <AdminMainContent>
        <div className="admin-page-header mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Room Bookings</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Booking history and schedule for <span className="font-medium">{roomTitle}</span>
            </p>
          </div>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            Back
          </button>
        </div>

        <div className="admin-table-shell">
          <div className="overflow-x-auto">
            <table className="admin-data-table w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left uppercase">Guest</th>
                  <th className="px-4 py-3 text-left uppercase">Email</th>
                  <th className="px-4 py-3 text-left uppercase">Mobile</th>
                  <th className="px-4 py-3 text-left uppercase">Status</th>
                  <th className="px-4 py-3 text-left uppercase">Check-in</th>
                  <th className="px-4 py-3 text-left uppercase">Check-out</th>
                </tr>
              </thead>
              <tbody>
                {bookings.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-gray-500 dark:text-gray-400" colSpan={6}>
                      No bookings found for this room.
                    </td>
                  </tr>
                ) : (
                  bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                        {[booking.name, booking.surname].filter(Boolean).join(' ') || '-'}
                      </td>
                      <td className="px-4 py-3 admin-cell-muted">{booking.email || '-'}</td>
                      <td className="px-4 py-3 admin-cell-muted">{booking.mobile || '-'}</td>
                      <td className="px-4 py-3">{getStatusBadge(booking.status)}</td>
                      <td className="px-4 py-3 admin-cell-muted">
                        {booking.checkIn ? new Date(booking.checkIn).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-3 admin-cell-muted">
                        {booking.checkOut ? new Date(booking.checkOut).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </AdminMainContent>
    </div>
  );
}
