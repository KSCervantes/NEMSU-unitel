"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';

interface Maintenance {
  id: string;
  status: 'pending' | 'in-progress' | 'completed';
  room?: string;
  roomSlug?: string;
  start?: string;
  end?: string;
  notes?: string;
}

export default function RoomMaintenancePage() {
  const params = useParams();
  const router = useRouter();
  const slug = (params?.slug as string) || '';
  const roomName = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const [items, setItems] = useState<Maintenance[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ start: string; end: string; notes: string }>({ start: '', end: '', notes: '' });
  const [roomNameFromDoc, setRoomNameFromDoc] = useState<string | undefined>();

  useEffect(() => {
    if (!slug) return;
    let unsubscribers: (() => void)[] = [];
    const rowsMap = new Map<string, Maintenance>();

    (async () => {
      try {
        const roomRef = doc(db, 'rooms', slug);
        const snap = await getDoc(roomRef);
        if (snap.exists()) {
          const data = snap.data() as any;
          if (data?.name) setRoomNameFromDoc(data.name);
        }
      } catch {}

      const displayName = roomNameFromDoc || roomName;
      const qBySlug = query(collection(db, 'maintenance'), where('roomSlug', '==', slug));
      const qByName = query(collection(db, 'maintenance'), where('room', '==', displayName));

      const applySnap = (snap: any) => {
        snap.forEach((doc: any) => rowsMap.set(doc.id, { id: doc.id, ...doc.data() }));
        setItems(Array.from(rowsMap.values()));
      };

      const unsubSlug = onSnapshot(qBySlug, applySnap);
      const unsubName = onSnapshot(qByName, applySnap);
      unsubscribers = [unsubSlug, unsubName];
    })();

    return () => { unsubscribers.forEach(fn => fn()); };
  }, [slug, roomName, roomNameFromDoc]);

  const createMaintenance = async () => {
    if (!form.start || !form.end) {
      alert('Please set start and end dates.');
      return;
    }
    try {
      setSaving(true);
      await addDoc(collection(db, 'maintenance'), {
        room: roomNameFromDoc || roomName,
        roomSlug: slug,
        status: 'pending',
        start: new Date(form.start).toISOString(),
        end: new Date(form.end).toISOString(),
        notes: form.notes,
        createdAt: serverTimestamp(),
      });
      setForm({ start: '', end: '', notes: '' });
    } catch (e) {
      console.error('Failed to create maintenance', e);
      alert('Failed to create maintenance.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Maintenance for: <span className="text-blue-700">{roomName}</span></h1>
          <button onClick={() => router.back()} className="px-4 py-2 border rounded">Back</button>
        </div>

        <div className="bg-white rounded-xl shadow p-4 mb-6">
          <h2 className="text-lg font-semibold mb-3">Create Maintenance Window</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
              <input type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
              <input type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="w-full border rounded px-3 py-2" />
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border rounded px-3 py-2" />
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={createMaintenance} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving...' : 'Add Maintenance'}</button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-lg font-semibold mb-3">Existing Maintenance</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Start</th>
                  <th className="py-2 px-3">End</th>
                  <th className="py-2 px-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td className="py-4 px-3" colSpan={4}>No maintenance records.</td></tr>
                ) : items.map((m) => (
                  <tr key={m.id} className="border-b">
                    <td className="py-2 px-3"><span className={`px-2 py-1 rounded text-xs ${m.status === 'in-progress' ? 'bg-amber-100 text-amber-700' : m.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{m.status}</span></td>
                    <td className="py-2 px-3">{m.start ? new Date(m.start).toLocaleString() : '—'}</td>
                    <td className="py-2 px-3">{m.end ? new Date(m.end).toLocaleString() : '—'}</td>
                    <td className="py-2 px-3">{m.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
