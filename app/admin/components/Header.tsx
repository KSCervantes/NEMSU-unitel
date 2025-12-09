"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db, storage } from '@/lib/firebase';
import { collection, onSnapshot, query, where, orderBy, limit, doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useSidebar } from '../context/SidebarContext';

interface Activity {
  id: string;
  name: string;
  surname: string;
  room: string;
  status: string;
  createdAt: any;
}

interface UserProfile {
  displayName: string;
  email: string;
  photoURL: string | null;
  initials: string;
}

export default function Header() {
  const router = useRouter();
  const { isCollapsed } = useSidebar();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [viewedNotifications, setViewedNotifications] = useState<Set<string>>(new Set());
  const [userProfile, setUserProfile] = useState<UserProfile>({
    displayName: 'Admin User',
    email: 'admin@unitel.com',
    photoURL: null,
    initials: 'A'
  });

  const handleLogout = async () => {
    try {
      await signOut(auth);
      sessionStorage.removeItem('adminAuth');
      sessionStorage.removeItem('adminEmail');
      router.push('/admin');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Theme handling removed

  useEffect(() => {
    // Get user profile from Firebase Auth and load viewed notifications
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const getInitials = (name: string) => {
          const parts = name.split(' ');
          if (parts.length >= 2) {
            return parts[0][0] + parts[1][0];
          }
          return parts[0][0];
        };

        setUserProfile({
          displayName: user.displayName || 'Admin User',
          email: user.email || 'admin@unitel.com',
          photoURL: user.photoURL,
          initials: user.displayName ? getInitials(user.displayName) : (user.email ? user.email[0].toUpperCase() : 'A')
        });

        // Load viewed notifications from Firebase
        if (user.email) {
          try {
            const notificationsRef = doc(db, 'adminNotifications', user.email);
            const notificationsSnap = await getDoc(notificationsRef);
            
            if (notificationsSnap.exists()) {
              const data = notificationsSnap.data();
              const viewedIds = data.viewedIds || [];
              setViewedNotifications(new Set(viewedIds));
            } else {
              // Create document if it doesn't exist
              await setDoc(notificationsRef, {
                viewedIds: [],
                lastUpdated: serverTimestamp()
              });
              setViewedNotifications(new Set());
            }
          } catch (error) {
            console.error('Error loading viewed notifications from Firebase:', error);
            setViewedNotifications(new Set());
          }
        }
      }
    });

    // Live count of pending reservations (only unread ones)
    const q = query(collection(db, 'bookings'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Count only unread notifications
      let unread = 0;
      snapshot.forEach((doc) => {
        if (!viewedNotifications.has(doc.id)) {
          unread++;
        }
      });
      setUnreadCount(unread);
    }, (err) => {
      console.error('Notifications listener error:', err);
    });

    // Listen to recent booking activities
    const activitiesQuery = query(
      collection(db, 'bookings'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );
    const unsubscribeActivities = onSnapshot(activitiesQuery, (snapshot) => {
      const activities: Activity[] = [];
      snapshot.forEach((doc) => {
        activities.push({ id: doc.id, ...doc.data() } as Activity);
      });
      setRecentActivities(activities);
    }, (err) => {
      console.error('Activities listener error:', err);
    });

    return () => {
      unsubscribeAuth();
      unsubscribe();
      unsubscribeActivities();
    };
  }, [viewedNotifications]);

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
    <header className="sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3">
        {/* Left section - Title */}
        <div className="flex items-center space-x-4">
          <div className={`transition-all duration-300 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
              Admin Dashboard
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
              Hotel Management System
            </p>
          </div>
        </div>

        {/* Right section - User & Actions */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* Notifications */}
          <div className="relative">
            <button
              onClick={async () => {
                setIsNotificationOpen(!isNotificationOpen);
                // Mark all current activities as viewed when opening notifications
                if (!isNotificationOpen && userProfile.email) {
                  const newViewed = new Set(viewedNotifications);
                  const newIds: string[] = [];
                  
                  recentActivities.forEach(activity => {
                    if (!newViewed.has(activity.id)) {
                      newViewed.add(activity.id);
                      newIds.push(activity.id);
                    }
                  });
                  
                  if (newIds.length > 0) {
                    setViewedNotifications(newViewed);
                    // Save to Firebase
                    try {
                      const notificationsRef = doc(db, 'adminNotifications', userProfile.email);
                      await updateDoc(notificationsRef, {
                        viewedIds: arrayUnion(...newIds),
                        lastUpdated: serverTimestamp()
                      });
                    } catch (error) {
                      console.error('Error updating viewed notifications in Firebase:', error);
                    }
                  }
                }
              }}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              aria-expanded={isNotificationOpen}
              aria-haspopup="true"
            >
              <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-500 text-white" aria-label={`${unreadCount} unread notifications`}>
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {isNotificationOpen && (
              <>
                <div
                  className="fixed inset-0 z-10 bg-black/20"
                  onClick={() => setIsNotificationOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-20">
                  {/* Header */}
                  <div className="px-4 py-3 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between">
                    <h3 className="font-semibold text-base text-gray-900 dark:text-white flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      Recent Activities
                    </h3>
                    {unreadCount > 0 && (
                      <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs font-medium">
                        {unreadCount} pending
                      </span>
                    )}
                  </div>

                  {/* Activities List */}
                  <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                    {recentActivities.length > 0 ? (
                      recentActivities.map((activity) => {
                        const isViewed = viewedNotifications.has(activity.id);
                        return (
                        <div
                          key={activity.id}
                          className={`px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 cursor-pointer transition-colors ${
                            !isViewed ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                          }`}
                          onClick={async () => {
                            // Mark as viewed when clicked
                            if (!viewedNotifications.has(activity.id) && userProfile.email) {
                              const newViewed = new Set(viewedNotifications);
                              newViewed.add(activity.id);
                              setViewedNotifications(newViewed);
                              
                              // Save to Firebase
                              try {
                                const notificationsRef = doc(db, 'adminNotifications', userProfile.email);
                                await updateDoc(notificationsRef, {
                                  viewedIds: arrayUnion(activity.id),
                                  lastUpdated: serverTimestamp()
                                });
                              } catch (error) {
                                console.error('Error updating viewed notification in Firebase:', error);
                              }
                            }
                            
                            setIsNotificationOpen(false);
                            router.push('/admin/reservations');
                          }}
                        >
                          {!isViewed && (
                            <div className="absolute top-3 right-3 w-2 h-2 bg-blue-500 rounded-full"></div>
                          )}
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                              activity.status === 'pending' ? 'bg-amber-100 dark:bg-amber-900/30' :
                              activity.status === 'confirmed' ? 'bg-green-100 dark:bg-green-900/30' :
                              'bg-red-100 dark:bg-red-900/30'
                            }`}>
                              {activity.status === 'pending' && (
                                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                              {activity.status === 'confirmed' && (
                                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                              {activity.status === 'cancelled' && (
                                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                {activity.status === 'pending' ? 'New Reservation' :
                                 activity.status === 'confirmed' ? 'Booking Confirmed' :
                                 'Booking Cancelled'}
                              </p>
                              <p className="text-sm text-gray-600 truncate mt-0.5">
                                {activity.name} {activity.surname} - {activity.room}
                              </p>
                              <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {getTimeAgo(activity.createdAt)}
                              </p>
                            </div>
                          </div>
                          {!isViewed && (
                            <div className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full"></div>
                          )}
                        </div>
                        );
                      })
                    ) : (
                      <div className="px-4 py-12 text-center text-gray-500">
                        <div className="w-16 h-16 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium">No recent activities</p>
                        <p className="text-xs text-gray-400 mt-1">New bookings will appear here</p>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  {recentActivities.length > 0 && (
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
                      <button
                        onClick={() => {
                          setIsNotificationOpen(false);
                          router.push('/admin/reservations');
                        }}
                        className="w-full text-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        View All Reservations
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center space-x-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={`User menu for ${userProfile.displayName}`}
              aria-expanded={isDropdownOpen}
              aria-haspopup="true"
            >
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{userProfile.displayName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Administrator</p>
              </div>
              {userProfile.photoURL ? (
                <img
                  src={userProfile.photoURL}
                  alt={userProfile.displayName}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                  <span>{userProfile.initials}</span>
                </div>
              )}
              <svg className={`w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10 bg-black/20"
                  onClick={() => setIsDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-20">
                  {/* Profile Header */}
                  <div className="px-4 py-4 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                    <div className="flex items-center gap-3">
                      {userProfile.photoURL ? (
                        <img
                          src={userProfile.photoURL}
                          alt={userProfile.displayName}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                          <span>{userProfile.initials}</span>
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{userProfile.displayName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{userProfile.email}</p>
                      </div>
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="py-2">
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        router.push('/admin/dashboard');
                      }}
                      className="w-full flex items-center px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3">
                        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-medium">Dashboard</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Overview & metrics</p>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        router.push('/admin/reservations');
                      }}
                      className="w-full flex items-center px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center mr-3">
                        <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-medium">My Reservations</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Manage bookings</p>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        router.push('/admin/room');
                      }}
                      className="w-full flex items-center px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mr-3">
                        <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-medium">Rooms</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Room management</p>
                      </div>
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>

                  {/* Settings & Logout */}
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        router.push('/admin/settings');
                      }}
                      className="w-full flex items-center px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center mr-3">
                        <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-medium">Settings</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Preferences</p>
                      </div>
                    </button>

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center mr-3">
                        <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-medium">Logout</p>
                        <p className="text-xs text-red-500 dark:text-red-400">Sign out from admin</p>
                      </div>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
