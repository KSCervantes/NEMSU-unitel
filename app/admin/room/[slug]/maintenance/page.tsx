"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { useProtectedAdminPage } from '@/app/admin/hooks/useProtectedAdminPage';
import Sidebar from '@/app/admin/components/Sidebar';
import Header from '@/app/admin/components/Header';
import AdminMainContent from '@/app/admin/components/AdminMainContent';

interface Maintenance {
  id: string;
  status?: 'pending' | 'in-progress' | 'completed';
  room?: string;
  roomSlug?: string;
  start?: string;
  end?: string;
  notes?: string;
}

export default function RoomMaintenancePage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useProtectedAdminPage();
  const slug = (params?.slug as string) || '';
  const fallbackName = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const [items, setItems] = useState<Maintenance[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ start: string; end: string; notes: string }>({ start: '', end: '', notes: '' });
  const [roomName, setRoomName] = useState(fallbackName);

  useEffect(() => {
    if (!slug) return;

    const unsubscribers: Array<() => void> = [];
    const rowsMap = new Map<string, Maintenance>();

    void (async () => {
      let canonicalName = fallbackName;
      try {
        const roomRef = doc(db, 'rooms', slug);
        const roomSnap = await getDoc(roomRef);
        if (roomSnap.exists()) {
          const data = roomSnap.data() as { name?: string };
          if (data?.name) {
            canonicalName = data.name;
            setRoomName(data.name);
          }
        }
      } catch {
        // Ignore lookup failures and continue with fallback room name.
      }

      const qBySlug = query(collection(db, 'maintenance'), where('roomSlug', '==', slug));
      const qByName = query(collection(db, 'maintenance'), where('room', '==', canonicalName));

      type MaintenanceDoc = Partial<Omit<Maintenance, 'id'>>;
      const applySnapshot = (snapshot: { forEach: (cb: (item: { id: string; data: () => MaintenanceDoc }) => void) => void }) => {
        snapshot.forEach((item) => {
          rowsMap.set(item.id, { id: item.id, ...item.data() });
        });
        const rows = Array.from(rowsMap.values()).sort((a, b) => {
          const aTime = a.start ? new Date(a.start).getTime() : 0;
          const bTime = b.start ? new Date(b.start).getTime() : 0;
          return bTime - aTime;
        });
        setItems(rows);
      };

      unsubscribers.push(onSnapshot(qBySlug, applySnapshot));
      unsubscribers.push(onSnapshot(qByName, applySnapshot));
    })();

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [slug, fallbackName]);

  const createMaintenance = async () => {
    if (!form.start || !form.end) {
      alert('Please set both start and end date/time.');
      return;
    }

    const startTime = new Date(form.start).getTime();
    const endTime = new Date(form.end).getTime();
    if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) {
      alert('End date/time must be after start date/time.');
      return;
    }

    try {
      setSaving(true);
      await addDoc(collection(db, 'maintenance'), {
        room: roomName,
        roomSlug: slug,
        status: 'pending',
        start: new Date(form.start).toISOString(),
        end: new Date(form.end).toISOString(),
        notes: form.notes.trim(),
        createdAt: serverTimestamp(),
      });
      setForm({ start: '', end: '', notes: '' });
    } catch (error) {
      console.error('Failed to create maintenance', error);
      alert('Failed to create maintenance schedule.');
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status?: Maintenance['status']) => {
    if (status === 'in-progress') {
      return <span className="px-2.5 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">In Progress</span>;
    }
    if (status === 'completed') {
      return <span className="px-2.5 py-1 rounded text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Completed</span>;
    }
    return <span className="px-2.5 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">Pending</span>;
  };

  if (!isAuthenticated || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-700 dark:text-gray-300 text-lg">Loading maintenance...</div>
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
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Room Maintenance</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Create and review maintenance windows for <span className="font-medium">{roomName}</span>
            </p>
          </div>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            Back
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create Maintenance Window</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Start</label>
              <input
                type="datetime-local"
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">End</label>
              <input
                type="datetime-local"
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2"
              placeholder="Optional details for this maintenance schedule"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={createMaintenance}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium"
            >
              {saving ? 'Saving...' : 'Add Maintenance'}
            </button>
          </div>
        </div>

        <div className="admin-table-shell">
          <div className="overflow-x-auto">
            <table className="admin-data-table w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left uppercase">Status</th>
                  <th className="px-4 py-3 text-left uppercase">Start</th>
                  <th className="px-4 py-3 text-left uppercase">End</th>
                  <th className="px-4 py-3 text-left uppercase">Notes</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-gray-500 dark:text-gray-400" colSpan={4}>
                      No maintenance records found for this room.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                      <td className="px-4 py-3 admin-cell-muted">
                        {item.start ? new Date(item.start).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 admin-cell-muted">
                        {item.end ? new Date(item.end).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 admin-cell-muted">
                        {item.notes || '-'}
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
