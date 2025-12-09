"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';

interface Booking {
  id: string;
  name?: string;
  surname?: string;
  email?: string;
  mobile?: string;
  status: string;
  checkIn: string;
  checkOut: string;
}

export default function RoomBookingsPage() {
  const params = useParams();
  const router = useRouter();
  const slug = (params?.slug as string) || '';
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [debugInfo, setDebugInfo] = useState<{ slug: string; displayName: string; roomNameFromDoc?: string; countBySlug: number; countByName: number; countByRawSlugName: number } | null>(null);

  useEffect(() => {
    if (!slug) return;
    const displayName = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    let unsubscribers: (() => void)[] = [];
    const rowsMap = new Map<string, Booking>();
    let countBySlug = 0;
    let countByName = 0;
    let countByRawSlugName = 0;

    const commit = (label?: string) => {
      const rows = Array.from(rowsMap.values());
      rows.sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime());
      setBookings(rows);
      setDebugInfo({ slug, displayName, roomNameFromDoc: debugInfo?.roomNameFromDoc, countBySlug, countByName, countByRawSlugName });
    };

    (async () => {
      // Try to read the room doc to get its canonical name
      let roomNameFromDoc: string | undefined;
      try {
        const roomRef = doc(db, 'rooms', slug);
        const snap = await getDoc(roomRef);
        if (snap.exists()) {
          const data = snap.data() as any;
          if (data?.name) roomNameFromDoc = data.name as string;
        }
      } catch {}

      const qBySlug = query(collection(db, 'bookings'), where('roomSlug', '==', slug));
      const qByName = query(collection(db, 'bookings'), where('room', '==', roomNameFromDoc || displayName));
      const qByRawSlugName = query(collection(db, 'bookings'), where('room', '==', slug)); // fallback if someone stored slug in 'room'

      const applySnapSlug = (snap: any) => {
        countBySlug = snap.size || 0;
        snap.forEach((doc: any) => {
          const d = doc.data() as any;
          rowsMap.set(doc.id, { id: doc.id, ...d });
        });
        commit('slug');
      };
      const applySnapName = (snap: any) => {
        countByName = snap.size || 0;
        snap.forEach((doc: any) => {
          const d = doc.data() as any;
          rowsMap.set(doc.id, { id: doc.id, ...d });
        });
        commit('name');
      };
      const applySnapRawSlugName = (snap: any) => {
        countByRawSlugName = snap.size || 0;
        snap.forEach((doc: any) => {
          const d = doc.data() as any;
          rowsMap.set(doc.id, { id: doc.id, ...d });
        });
        commit('raw');
      };

      const unsubSlug = onSnapshot(qBySlug, applySnapSlug);
      const unsubName = onSnapshot(qByName, applySnapName);
      const unsubRaw = onSnapshot(qByRawSlugName, applySnapRawSlugName);

      unsubscribers = [unsubSlug, unsubName, unsubRaw];
      setDebugInfo({ slug, displayName, roomNameFromDoc, countBySlug, countByName, countByRawSlugName });
    })();

    return () => { unsubscribers.forEach(fn => fn()); };
  }, [slug]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Bookings for: <span className="text-blue-700">{slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</span></h1>
          <button onClick={() => router.back()} className="px-4 py-2 border rounded">Back</button>
        </div>
        <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
          {debugInfo && (
            <div className="mb-3 text-xs text-gray-500">
              <span className="mr-3">slug: {debugInfo.slug}</span>
              <span className="mr-3">displayName: {debugInfo.displayName}</span>
              {debugInfo.roomNameFromDoc && <span className="mr-3">roomNameFromDoc: {debugInfo.roomNameFromDoc}</span>}
              <span className="mr-3">countBySlug: {debugInfo.countBySlug}</span>
              <span className="mr-3">countByName: {debugInfo.countByName}</span>
              <span className="mr-3">countByRawSlugName: {debugInfo.countByRawSlugName}</span>
            </div>
          )}
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 px-3">Guest</th>
                <th className="py-2 px-3">Email</th>
                <th className="py-2 px-3">Mobile</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Check-in</th>
                <th className="py-2 px-3">Check-out</th>
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 ? (
                <tr><td className="py-4 px-3" colSpan={6}>No bookings found.</td></tr>
              ) : bookings.map((b) => (
                <tr key={b.id} className="border-b">
                  <td className="py-2 px-3">{[b.name, b.surname].filter(Boolean).join(' ') || '—'}</td>
                  <td className="py-2 px-3">{b.email || '—'}</td>
                  <td className="py-2 px-3">{b.mobile || '—'}</td>
                  <td className="py-2 px-3"><span className={`px-2 py-1 rounded text-xs ${b.status === 'confirmed' ? 'bg-green-100 text-green-700' : b.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>{b.status}</span></td>
                  <td className="py-2 px-3">{new Date(b.checkIn).toLocaleString()}</td>
                  <td className="py-2 px-3">{new Date(b.checkOut).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
