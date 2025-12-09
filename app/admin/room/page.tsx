"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import Image from 'next/image';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminMainContent from '../components/AdminMainContent';
import { useRouter as useNextRouter } from 'next/navigation';
import { db, storage } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { ref, getDownloadURL, uploadBytes, deleteObject } from 'firebase/storage';
import { updateRoomImagesToStorageUrls } from '@/lib/utils/updateRoomImages';
import EmptyState from '@/app/components/EmptyState';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { useKeyboardNavigation } from '@/app/hooks/useKeyboardNavigation';
import { logError } from '@/lib/logger';

interface RoomType {
  id?: string;
  name: string;
  price: string;
  description: string;
  image: string;
  perBed?: string;
  maxGuests?: number;
}

interface RoomStatus {
  activeBookings: number;
  underMaintenance: boolean;
}

export default function RoomManagement() {
  const router = useRouter();
  const nextRouter = useNextRouter();
  const { isAuthenticated, isLoading } = useProtectedAdminPage();

  // Enable keyboard navigation
  useKeyboardNavigation();
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomStatus, setRoomStatus] = useState<{ [key: string]: RoomStatus }>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newRoom, setNewRoom] = useState<{ name: string; price: string; description: string; perBed?: string; maxGuests?: number; imageFile?: File | null }>({ name: '', price: '', description: '', perBed: '', maxGuests: 2, imageFile: null });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<{ id?: string; name: string; price: string; description: string; perBed?: string; maxGuests?: number; image?: string; imageFile?: File | null } | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      initializeRooms();
    }
  }, [isAuthenticated, isLoading]);

  // Set up room status listeners after roomTypes are loaded
  useEffect(() => {
    if (roomTypes.length > 0) {
      const cleanup = fetchRoomStatus();
      return () => {
        if (cleanup && typeof cleanup === 'function') {
          cleanup();
        }
      };
    }
  }, [roomTypes]);

  const initializeRooms = async () => {
    try {
      setLoading(true);
      await fetchRooms();
    } catch (error) {
      logError('Error initializing rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRooms = async () => {
    try {
      const roomsRef = collection(db, 'rooms');
      const snapshot = await getDocs(roomsRef);

      if (snapshot.empty) {
        // Rooms collection is empty - admin should add rooms manually
        // No automatic initialization
        setRoomTypes([]);
      } else {
        const rooms: RoomType[] = [];
        snapshot.forEach((doc) => {
          rooms.push({ id: doc.id, ...doc.data() } as RoomType);
        });
        // Deduplicate by name
        const unique = Array.from(
          new Map(rooms.map((r) => [r.name, r])).values()
        );
        setRoomTypes(unique);
      }
    } catch (error) {
      logError('Error fetching rooms:', error);
    }
  };

  const fetchRoomStatus = () => {
    try {
      const bookingsRef = collection(db, 'bookings');
      const maintenanceRef = collection(db, 'maintenance');

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Real-time maintenance listener
      const maintenanceQueryRef = query(maintenanceRef, where('status', 'in', ['pending', 'in-progress']));
      const unsubscribeMaintenance = onSnapshot(maintenanceQueryRef, (snapshot) => {
        // Track maintenance by both display name and slug
        const maintenanceRooms = new Set<string>();
        snapshot.forEach((doc) => {
          const data = doc.data() as any;
          // Debug log (development only)
          if (process.env.NODE_ENV === 'development') {
            console.log('🔧 Maintenance Task:', {
              id: doc.id,
              room: data.room,
              roomSlug: data.roomSlug,
              status: data.status,
              title: data.title
            });
          }
          const nameOrSlug: string | undefined = data.roomSlug || data.room;
          if (!nameOrSlug) return;
          maintenanceRooms.add(String(nameOrSlug));
        });
        // Debug log (development only)
        if (process.env.NODE_ENV === 'development') {
          console.log('🔧 Rooms under maintenance:', Array.from(maintenanceRooms));
        }

        setRoomStatus((prev) => {
          const next: { [key: string]: RoomStatus } = {};
          roomTypes.forEach((room) => {
            const nameBasedSlug = room.name.toLowerCase().trim().replace(/\s+/g, '-');
            const isUnder = maintenanceRooms.has(room.name) ||
              maintenanceRooms.has(nameBasedSlug) ||
              maintenanceRooms.has(room.id || '');
            // Debug log (development only)
            if (process.env.NODE_ENV === 'development') {
              console.log(`🔧 ${room.name}: checking "${room.name}", "${nameBasedSlug}", "${room.id}" = ${isUnder}`);
            }
            next[room.name] = {
              activeBookings: prev[room.name]?.activeBookings || 0,
              underMaintenance: isUnder,
            };
          });
          return next;
        });
      }, (error) => logError('Maintenance listener error:', error));

      // Real-time bookings listener
      const unsubscribeBookings = onSnapshot(bookingsRef, (snapshot) => {
        const bookingCountsByName: { [key: string]: number } = {};
        const bookingCountsBySlug: { [key: string]: number } = {};

        snapshot.forEach((doc) => {
          const data = doc.data() as any;
          if (!data) return;

          const statusOk = data.status === 'confirmed' || data.status === 'in-progress';
          if (!statusOk) return;

          const checkIn = new Date(data.checkIn);
          const checkOut = new Date(data.checkOut);
          checkIn.setHours(0, 0, 0, 0);
          checkOut.setHours(0, 0, 0, 0);
          const todayTime = today.getTime();
          const checkInTime = checkIn.getTime();
          const checkOutTime = checkOut.getTime();

          // Check if today falls within the booking period (checkout day is exclusive - room available on checkout day)
          // Matches BookingModal logic: checkout is exclusive
          const isActive = checkInTime <= todayTime && checkOutTime > todayTime;
          if (!isActive) return;

          const name = data.room as string | undefined;
          const slug = data.roomSlug as string | undefined;

          if (name && typeof name === 'string') {
            bookingCountsByName[name] = (bookingCountsByName[name] || 0) + 1;
          }
          if (slug && typeof slug === 'string') {
            bookingCountsBySlug[slug] = (bookingCountsBySlug[slug] || 0) + 1;
          }
        });

        setRoomStatus((prev) => {
          const next: { [key: string]: RoomStatus } = {};
          roomTypes.forEach((room) => {
            const roomSlug = room.id || room.name.toLowerCase().trim().replace(/\s+/g, '-');
            const countByName = bookingCountsByName[room.name] || 0;
            const countBySlug = bookingCountsBySlug[roomSlug] || 0;
            const count = countByName + countBySlug;

            next[room.name] = {
              activeBookings: count,
              underMaintenance: prev[room.name]?.underMaintenance || false,
            };
          });
          return next;
        });
      }, (error) => logError('Bookings listener error:', error));

      // Return unsubscribers if needed (not used here due to Admin lifecycle)
      return () => {
        unsubscribeMaintenance();
        unsubscribeBookings();
      };
    } catch (error) {
      logError('Error fetching room status:', error);
    }
  };

  const getTotalAvailable = () => {
    return roomTypes.filter(room => {
      const status = roomStatus[room.name];
      return status && !status.underMaintenance && status.activeBookings === 0;
    }).length;
  };

  const getTotalOccupied = () => {
    return roomTypes.filter(room => {
      const status = roomStatus[room.name];
      return status && status.activeBookings > 0;
    }).length;
  };

  const getTotalMaintenance = () => {
    return roomTypes.filter(room => {
      const status = roomStatus[room.name];
      return status && status.underMaintenance;
    }).length;
  };

  const getRoomStatusBadge = (roomName: string) => {
    const status = roomStatus[roomName];
    if (!status) return null;

    if (status.underMaintenance) {
      return (
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
          Under Maintenance
        </span>
      );
    }

    if (status.activeBookings > 0) {
      return (
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 border border-red-200">
          {status.activeBookings} Active Booking{status.activeBookings > 1 ? 's' : ''}
        </span>
      );
    }

    return (
      <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 border border-green-200">
        Available
      </span>
    );
  };

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
        <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Room Management</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
              Manage hotel rooms and availability
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowDebug(!showDebug)} className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              {showDebug ? 'Hide' : 'Show'} Debug
            </button>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Add new room type"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add New Room
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner size="lg" text="Loading rooms..." />
          </div>
        ) : roomTypes.length === 0 ? (
          <div className="py-20">
            <EmptyState
              title="No rooms configured"
              description="Add your first room type to start managing hotel accommodations."
              icon={
                <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              }
              action={
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Add First Room
                </button>
              }
            />
          </div>
        ) : (
          <>
            {/* Debug Panel */}
            {showDebug && (
              <div className="mb-6 bg-gray-800 text-white p-4 rounded-lg">
                <h3 className="font-bold mb-2">Debug: Room Status</h3>
                <pre className="text-xs overflow-auto">{JSON.stringify(roomStatus, null, 2)}</pre>
                <h3 className="font-bold mt-4 mb-2">Debug: Room Types</h3>
                <pre className="text-xs overflow-auto">{JSON.stringify(roomTypes.map(r => ({ name: r.name, id: r.id })), null, 2)}</pre>
              </div>
            )}
            {/* Rooms Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {roomTypes.map((room, index) => {
                const status = roomStatus[room.name];
                return (
                  <div key={room.id || `${room.name}-${index}`} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-600 transition-all">
                    {/* Room Image */}
                    <div className="relative h-64 w-full">
                      <Image
                        src={room.image}
                        alt={room.name}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        loading="eager"
                        className="object-cover"
                      />
                      {status && status.underMaintenance && (
                        <>
                          <div className="absolute inset-0 bg-black/30 z-10" />
                          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 20 }} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500 text-white">
                            🔧 Under Maintenance
                          </div>
                        </>
                      )}
                    </div>

                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{room.name}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            <span className="font-bold text-blue-600 dark:text-blue-400 text-lg">₱{room.price}</span>
                            {room.perBed ? <span className="text-gray-500 dark:text-gray-400"> {room.perBed}</span> : <span className="text-gray-500 dark:text-gray-400"> per night</span>}
                          </p>
                        </div>
                        {getRoomStatusBadge(room.name)}
                      </div>

                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-3">
                        {room.description}
                      </p>
                      {status && status.activeBookings > 0 && (
                        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                          <div className="flex items-center text-sm text-blue-700 dark:text-blue-300">
                            <svg className="w-5 h-5 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <span className="font-medium">{status.activeBookings} active booking{status.activeBookings > 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      )}

                      {status && status.underMaintenance && (
                        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                          <div className="flex items-center text-sm text-amber-700 dark:text-amber-300">
                            <svg className="w-5 h-5 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span className="font-medium">This room type is currently under maintenance</span>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button onClick={() => {
                          const slug = (room.id || room.name.toLowerCase().trim().replace(/\s+/g, '-'));
                          nextRouter.push(`/admin/room/${slug}/bookings`);
                        }} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition text-sm shadow-sm">
                          View Bookings
                        </button>
                        <button onClick={() => { setEditingRoom({ id: room.id, name: room.name, price: room.price, description: room.description, perBed: room.perBed, maxGuests: room.maxGuests || 2, image: room.image, imageFile: null }); setIsEditModalOpen(true); }} className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm">
                          Manage
                        </button>
                        <button onClick={() => {
                          const slug = (room.id || room.name.toLowerCase().trim().replace(/\s+/g, '-'));
                          nextRouter.push(`/admin/room/${slug}/maintenance`);
                        }} className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm">
                          Maintenance
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Add Room Modal - Moved outside conditional to always be available */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsAddModalOpen(false);
            }
          }}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Add New Room Type</h2>
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="text-gray-600 hover:text-gray-900 text-2xl leading-none" aria-label="Close modal">✕</button>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!newRoom.name || !newRoom.price || !newRoom.description || !newRoom.maxGuests) {
                  Swal.fire({
                    icon: 'warning',
                    title: 'Required Fields',
                    text: 'Please fill in name, price, description, and max guests.',
                    confirmButtonColor: '#3b82f6'
                  });
                  return;
                }
                try {
                  setSaving(true);
                  const slug = newRoom.name.toLowerCase().trim().replace(/\s+/g, '-');
                  let imageUrl = '';
                  let uploadWarning = '';

                  if (newRoom.imageFile) {
                    try {
                      const fileName = newRoom.imageFile.name;
                      const storageRef = ref(storage, `rooms/${fileName}`);
                      await uploadBytes(storageRef, newRoom.imageFile);
                      imageUrl = await getDownloadURL(storageRef);
                    } catch (uploadErr: any) {
                      logError('Storage upload failed:', uploadErr);
                      uploadWarning = `Image upload failed (${uploadErr?.code || 'network error'}). Room saved with placeholder image. You can edit later to add an image.`;
                      imageUrl = '';
                    }
                  }

                  const payload: any = {
                    name: newRoom.name,
                    price: newRoom.price,
                    description: newRoom.description,
                    maxGuests: newRoom.maxGuests || 2,
                  };
                  if (newRoom.perBed) payload.perBed = newRoom.perBed;

                  // Set image: use uploaded URL, or fallback to a local placeholder
                  if (imageUrl) {
                    payload.image = imageUrl;
                  } else if (newRoom.imageFile) {
                    // User tried to upload but it failed - use generic placeholder
                    payload.image = '/img/ROOMS.jpg';
                  } else {
                    // No image provided - use generic placeholder
                    payload.image = '/img/ROOMS.jpg';
                  }

                  // Ensure a doc with deterministic id (slug)
                  const docRef = doc(db, 'rooms', slug);
                  await setDoc(docRef, payload, { merge: true });

                  // Refresh list
                  await fetchRooms();
                  setIsAddModalOpen(false);
                  setNewRoom({ name: '', price: '', description: '', perBed: '', maxGuests: 2, imageFile: null });

                  if (uploadWarning) {
                    Swal.fire({
                      icon: 'warning',
                      title: 'Room Added with Warning',
                      html: `<p>✅ Room added successfully!</p><p class="text-sm text-gray-600 mt-2">⚠️ ${uploadWarning}</p>`,
                      confirmButtonColor: '#3b82f6'
                    });
                  } else {
                    Swal.fire({
                      icon: 'success',
                      title: 'Room Added!',
                      text: 'Room added successfully',
                      toast: true,
                      position: 'top-end',
                      showConfirmButton: false,
                      timer: 3000
                    });
                  }
                } catch (err) {
                  logError('Error adding room:', err);
                  Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Failed to add room. Please try again.',
                    confirmButtonColor: '#3b82f6'
                  });
                } finally {
                  setSaving(false);
                }
              }} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Room Name *</label>
                    <input value={newRoom.name} onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="e.g., Suite Room" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price *</label>
                    <input value={newRoom.price} onChange={(e) => setNewRoom({ ...newRoom, price: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="e.g., 1,200.00" required />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Guests *</label>
                    <input type="number" min="1" max="20" value={newRoom.maxGuests || 2} onChange={(e) => setNewRoom({ ...newRoom, maxGuests: parseInt(e.target.value) || 2 })} className="w-full border rounded-lg px-3 py-2" placeholder="e.g., 2" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Per Bed (optional)</label>
                    <input value={newRoom.perBed} onChange={(e) => setNewRoom({ ...newRoom, perBed: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="e.g., / Bed" />
                    <p className="text-xs text-gray-500 mt-1">Add this if pricing is per bed (e.g., Dorm Room)</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Image *</label>
                  <input type="file" accept="image/*" onChange={(e) => setNewRoom({ ...newRoom, imageFile: e.target.files?.[0] || null })} className="w-full" required />
                  <p className="text-xs text-gray-500 mt-1">Upload room image (will be stored in Firebase Storage)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                  <textarea value={newRoom.description} onChange={(e) => setNewRoom({ ...newRoom, description: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={4} placeholder="Describe the room type, amenities, and features..." required />
                </div>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving...' : 'Save Room'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </AdminMainContent>

      {/* Edit Room Modal */}
      {isEditModalOpen && editingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Edit Room Type</h2>
              <button onClick={() => { setIsEditModalOpen(false); setEditingRoom(null); }} className="text-gray-600 hover:text-gray-900">✕</button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!editingRoom) return;
              if (!editingRoom.name || !editingRoom.price || !editingRoom.description || !editingRoom.maxGuests) {
                Swal.fire({
                  icon: 'warning',
                  title: 'Required Fields',
                  text: 'Please fill in name, price, description, and max guests.',
                  confirmButtonColor: '#3b82f6'
                });
                return;
              }
              try {
                setSaving(true);
                // Use existing id if present; otherwise slug by name
                const slug = (editingRoom.id || editingRoom.name.toLowerCase().trim().replace(/\s+/g, '-'));
                let imageUrl = editingRoom.image || '';
                if (editingRoom.imageFile) {
                  const storageRef = ref(storage, `rooms/${slug}-${Date.now()}`);
                  await uploadBytes(storageRef, editingRoom.imageFile);
                  imageUrl = await getDownloadURL(storageRef);
                }
                const payload: any = {
                  name: editingRoom.name,
                  price: editingRoom.price,
                  description: editingRoom.description,
                  maxGuests: editingRoom.maxGuests || 2,
                };
                if (editingRoom.perBed) payload.perBed = editingRoom.perBed;
                if (imageUrl) payload.image = imageUrl;
                const docRef = doc(db, 'rooms', slug);
                await setDoc(docRef, payload, { merge: true });
                await fetchRooms();
                setIsEditModalOpen(false);
                setEditingRoom(null);
                Swal.fire({
                  icon: 'success',
                  title: 'Updated!',
                  text: 'Room updated successfully',
                  toast: true,
                  position: 'top-end',
                  showConfirmButton: false,
                  timer: 3000
                });
              } catch (err) {
                logError('Error updating room:', err);
                Swal.fire({
                  icon: 'error',
                  title: 'Error',
                  text: 'Failed to update room.',
                  confirmButtonColor: '#3b82f6'
                });
              } finally {
                setSaving(false);
              }
            }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Room Name *</label>
                  <input value={editingRoom.name} onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price *</label>
                  <input value={editingRoom.price} onChange={(e) => setEditingRoom({ ...editingRoom, price: e.target.value })} className="w-full border rounded-lg px-3 py-2" required />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Guests *</label>
                  <input type="number" min="1" max="20" value={editingRoom.maxGuests || 2} onChange={(e) => setEditingRoom({ ...editingRoom, maxGuests: parseInt(e.target.value) || 2 })} className="w-full border rounded-lg px-3 py-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Per Bed (optional)</label>
                  <input value={editingRoom.perBed || ''} onChange={(e) => setEditingRoom({ ...editingRoom, perBed: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="e.g., / Bed" />
                  <p className="text-xs text-gray-500 mt-1">Add this if pricing is per bed</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Replace Image</label>
                <input type="file" accept="image/*" onChange={(e) => setEditingRoom({ ...editingRoom, imageFile: e.target.files?.[0] || null })} className="w-full" />
                <p className="text-xs text-gray-500 mt-1">Leave empty to keep current image</p>
                {editingRoom.image && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Current image:</p>
                    <img src={editingRoom.image} alt={editingRoom.name} className="w-32 h-32 object-cover rounded border" />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea value={editingRoom.description} onChange={(e) => setEditingRoom({ ...editingRoom, description: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={4} placeholder="Describe the room type, amenities, and features..." required />
              </div>
              <div className="flex justify-between items-center">
                <button type="button" onClick={async () => {
                  if (!editingRoom) return;
                  const result = await Swal.fire({
                    title: 'Delete Room?',
                    text: 'This will remove the room type and its image. This action cannot be undone.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#ef4444',
                    cancelButtonColor: '#6b7280',
                    confirmButtonText: 'Yes, delete it',
                    cancelButtonText: 'Cancel'
                  });
                  if (!result.isConfirmed) return;
                  try {
                    setSaving(true);
                    Swal.fire({
                      title: 'Deleting...',
                      didOpen: () => {
                        Swal.showLoading();
                      },
                      willClose: () => { }
                    });
                    const id = editingRoom.id || editingRoom.name.toLowerCase().trim().replace(/\s+/g, '-');
                    if (editingRoom.image && editingRoom.image.startsWith('https://')) {
                      try {
                        const url = new URL(editingRoom.image);
                        const pathMatch = url.pathname.match(/\/o\/([^?]+)\/?.*/);
                        if (pathMatch && pathMatch[1]) {
                          const decodedPath = decodeURIComponent(pathMatch[1]);
                          if (decodedPath.startsWith('rooms/')) {
                            const imgRef = ref(storage, decodedPath);
                            await deleteObject(imgRef).catch(() => { });
                          }
                        }
                      } catch { }
                    }
                    await deleteDoc(doc(db, 'rooms', id));
                    await fetchRooms();
                    setIsEditModalOpen(false);
                    setEditingRoom(null);
                    Swal.fire({
                      icon: 'success',
                      title: 'Deleted!',
                      text: 'Room has been deleted successfully',
                      toast: true,
                      position: 'top-end',
                      showConfirmButton: false,
                      timer: 3000
                    });
                  } catch (err) {
                    logError('Failed to delete room:', err);
                    Swal.fire({
                      icon: 'error',
                      title: 'Error',
                      text: 'Failed to delete room.',
                      confirmButtonColor: '#3b82f6'
                    });
                  } finally {
                    setSaving(false);
                  }
                }} className="px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50">Delete</button>
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setIsEditModalOpen(false); setEditingRoom(null); }} className="px-4 py-2 border rounded-lg">Cancel</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
