"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminMainContent from '../components/AdminMainContent';
import { auth, db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { logError } from '@/lib/logger';
import { DEFAULT_HOTEL_SETTINGS } from '@/lib/hotelSettings';
import { AUTHORIZED_ADMIN_EMAILS, isNemsuEmail } from '@/lib/adminAuth';
import { normalizeAdminEmail } from '@/lib/adminUsers';

type FirestoreAdminDoc = {
  email: string;
  active: boolean;
  role: 'admin';
  addedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type ManagedAdminUser = {
  email: string;
  active: boolean;
  role: 'admin';
  source: 'bootstrap' | 'firestore';
  addedBy: string;
};

export default function Settings() {
  const { isAuthenticated, isLoading } = useProtectedAdminPage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({ ...DEFAULT_HOTEL_SETTINGS });
  const [adminUsers, setAdminUsers] = useState<ManagedAdminUser[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [adminSaving, setAdminSaving] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    const initializeData = async () => {
      await Promise.all([loadSettings(), loadAdminUsers()]);
    };

    if (auth.currentUser) {
      void initializeData();
      return;
    }

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        void initializeData();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated, isLoading]);

  const loadSettings = async () => {
    try {
      const settingsRef = doc(db, 'settings', 'hotel');
      const settingsDoc = await getDoc(settingsRef);

      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        setSettings({
          hotelName: data.hotelName || DEFAULT_HOTEL_SETTINGS.hotelName,
          checkInTime: data.checkInTime || DEFAULT_HOTEL_SETTINGS.checkInTime,
          checkOutTime: data.checkOutTime || DEFAULT_HOTEL_SETTINGS.checkOutTime,
          currency: data.currency || DEFAULT_HOTEL_SETTINGS.currency,
          contactEmail: data.contactEmail || DEFAULT_HOTEL_SETTINGS.contactEmail,
          contactPhone: data.contactPhone || DEFAULT_HOTEL_SETTINGS.contactPhone,
          address: data.address || DEFAULT_HOTEL_SETTINGS.address,
        });
      }
    } catch (error) {
      logError(error, { context: 'Settings - Error loading settings' });
    } finally {
      setLoading(false);
    }
  };

  const loadAdminUsers = async () => {
    setAdminsLoading(true);
    try {
      const adminSnapshot = await getDocs(collection(db, 'adminUsers'));
      const merged = new Map<string, ManagedAdminUser>();

      AUTHORIZED_ADMIN_EMAILS.forEach((email) => {
        const normalized = normalizeAdminEmail(email);
        if (!normalized) return;
        merged.set(normalized, {
          email: normalized,
          active: true,
          role: 'admin',
          source: 'bootstrap',
          addedBy: 'bootstrap',
        });
      });

      adminSnapshot.forEach((docSnap) => {
        const data = docSnap.data() as Partial<FirestoreAdminDoc>;
        const normalized = normalizeAdminEmail(docSnap.id || data.email || '');
        if (!normalized) return;
        const existing = merged.get(normalized);
        merged.set(normalized, {
          email: normalized,
          active: existing?.source === 'bootstrap' ? true : data.active === true,
          role: 'admin',
          source: existing?.source === 'bootstrap' ? 'bootstrap' : 'firestore',
          addedBy: typeof data.addedBy === 'string' && data.addedBy.trim()
            ? data.addedBy
            : existing?.addedBy || 'unknown',
        });
      });

      setAdminUsers(Array.from(merged.values()).sort((a, b) => a.email.localeCompare(b.email)));
    } catch (error) {
      logError(error, { context: 'Settings - Error loading admin users' });
      setAdminUsers([]);
    } finally {
      setAdminsLoading(false);
    }
  };

  const saveAdminUser = async (targetEmail: string, isActive: boolean) => {
    const normalizedTarget = normalizeAdminEmail(targetEmail);
    const actorEmail = normalizeAdminEmail(auth.currentUser?.email || '');
    if (!normalizedTarget || !isNemsuEmail(normalizedTarget)) {
      throw new Error('Invalid admin email');
    }
    if (!actorEmail || !isNemsuEmail(actorEmail)) {
      throw new Error('Current admin email is invalid');
    }

    const adminRef = doc(db, 'adminUsers', normalizedTarget);
    const existingSnap = await getDoc(adminRef);
    const existingData = existingSnap.exists() ? (existingSnap.data() as Partial<FirestoreAdminDoc>) : null;

    await setDoc(adminRef, {
      email: normalizedTarget,
      active: isActive,
      role: 'admin',
      addedBy: actorEmail,
      createdAt: existingData?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleAddAdminUser = async () => {
    const normalized = normalizeAdminEmail(newAdminEmail);
    if (!normalized) {
      Swal.fire({
        icon: 'warning',
        title: 'Missing Email',
        text: 'Enter an email address to add an admin.',
      });
      return;
    }
    if (!isNemsuEmail(normalized)) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Domain',
        text: 'Only @nemsu.edu.ph emails can be granted admin access.',
      });
      return;
    }

    setAdminSaving(true);
    try {
      await saveAdminUser(normalized, true);
      await loadAdminUsers();
      setNewAdminEmail('');
      Swal.fire({
        icon: 'success',
        title: 'Admin Added',
        text: `${normalized} can now access the admin panel.`,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2500,
      });
    } catch (error) {
      logError(error, { context: 'Settings - Error adding admin user' });
      Swal.fire({
        icon: 'error',
        title: 'Failed to Add Admin',
        text: 'Could not save this admin user. Please try again.',
      });
    } finally {
      setAdminSaving(false);
    }
  };

  const handleToggleAdminUser = async (adminUser: ManagedAdminUser) => {
    if (adminUser.source === 'bootstrap') {
      return;
    }

    const currentAdminEmail = normalizeAdminEmail(auth.currentUser?.email || '');
    if (adminUser.email === currentAdminEmail && adminUser.active) {
      Swal.fire({
        icon: 'warning',
        title: 'Action Blocked',
        text: 'You cannot deactivate your own admin access from this account.',
      });
      return;
    }

    setAdminSaving(true);
    try {
      await saveAdminUser(adminUser.email, !adminUser.active);
      await loadAdminUsers();
      Swal.fire({
        icon: 'success',
        title: adminUser.active ? 'Admin Deactivated' : 'Admin Activated',
        text: `${adminUser.email} is now ${adminUser.active ? 'inactive' : 'active'}.`,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2500,
      });
    } catch (error) {
      logError(error, { context: 'Settings - Error toggling admin user' });
      Swal.fire({
        icon: 'error',
        title: 'Update Failed',
        text: 'Could not update admin access. Please try again.',
      });
    } finally {
      setAdminSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      Swal.fire({
        title: 'Saving...',
        didOpen: () => {
          Swal.showLoading();
        },
        willClose: () => {}
      });
      const settingsRef = doc(db, 'settings', 'hotel');
      await setDoc(settingsRef, {
        ...settings,
        updatedAt: serverTimestamp(),
      });
      Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: 'Settings saved successfully',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to save settings. Please try again.',
        confirmButtonColor: '#3b82f6'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const result = await Swal.fire({
      title: 'Reset Settings?',
      text: 'This will reset all settings to default values',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, reset',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    setSaving(true);
    const defaultSettings = { ...DEFAULT_HOTEL_SETTINGS };

    try {
      Swal.fire({
        title: 'Resetting...',
        didOpen: () => {
          Swal.showLoading();
        },
        willClose: () => {}
      });
      const settingsRef = doc(db, 'settings', 'hotel');
      await setDoc(settingsRef, {
        ...defaultSettings,
        updatedAt: serverTimestamp(),
      });
      setSettings(defaultSettings);
      Swal.fire({
        icon: 'success',
        title: 'Reset!',
        text: 'Settings have been reset to defaults',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } catch (error) {
      console.error('Error resetting settings:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to reset settings. Please try again.',
        confirmButtonColor: '#3b82f6'
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          <div className="text-xl text-gray-700 dark:text-gray-300">Loading settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <Header />

      <AdminMainContent>
        {/* Header */}
        <div className="admin-page-header mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Manage hotel configuration and preferences</p>
        </div>

        {/* Settings Form */}
        <div className="max-w-4xl">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-200 dark:border-gray-700">
            {/* Hotel Information Section */}
            <div className="px-6 py-4 bg-linear-to-r from-blue-600 to-indigo-600">
              <h2 className="text-xl font-bold text-white flex items-center">
                <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                Hotel Information
              </h2>
            </div>

            <div className="p-6 space-y-6">
              {/* Hotel Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Hotel Name
                </label>
                <input
                  type="text"
                  name="hotelName"
                  value={settings.hotelName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  placeholder="Enter hotel name"
                />
              </div>

              {/* Contact Email */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Contact Email
                </label>
                <input
                  type="email"
                  name="contactEmail"
                  value={settings.contactEmail}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  placeholder="hotel@example.com"
                />
              </div>

              {/* Contact Phone */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  name="contactPhone"
                  value={settings.contactPhone}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  placeholder="+63 123 456 7890"
                />
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Address
                </label>
                <textarea
                  name="address"
                  value={settings.address}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all resize-none"
                  placeholder="Enter hotel address"
                />
              </div>
            </div>

            {/* Booking Settings Section */}
            <div className="px-6 py-4 bg-linear-to-r from-amber-500 to-orange-500">
              <h2 className="text-xl font-bold text-white flex items-center">
                <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Booking Settings
              </h2>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Check-in Time */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Check-in Time
                  </label>
                  <input
                    type="time"
                    name="checkInTime"
                    value={settings.checkInTime}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1">Default check-in time for guests</p>
                </div>

                {/* Check-out Time */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Check-out Time
                  </label>
                  <input
                    type="time"
                    name="checkOutTime"
                    value={settings.checkOutTime}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1">Default check-out time for guests</p>
                </div>
              </div>

              {/* Currency */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Currency
                </label>
                <select
                  name="currency"
                  value={settings.currency}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                >
                  <option value="PHP">PHP - Philippine Peso</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={handleReset}
                disabled={saving}
                className="px-6 py-3 rounded-lg font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reset to Default
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-3 rounded-lg font-semibold text-white bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>

          {/* Admin Access Management */}
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="px-6 py-4 bg-linear-to-r from-purple-600 to-fuchsia-600">
              <h2 className="text-xl font-bold text-white flex items-center">
                <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422A12.083 12.083 0 0120 14.5c0 1.636-3.582 3-8 3s-8-1.364-8-3c0-1.356.59-2.598 1.84-3.922L12 14z" />
                </svg>
                Admin Access Management
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Add or manage Firestore-backed admin accounts. Only `@nemsu.edu.ph` emails are allowed.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(event) => setNewAdminEmail(event.target.value)}
                  className="flex-1 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                  placeholder="new.admin@nemsu.edu.ph"
                />
                <button
                  onClick={handleAddAdminUser}
                  disabled={adminSaving || !newAdminEmail.trim()}
                  className="px-5 py-3 rounded-lg font-semibold text-white bg-linear-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Admin
                </button>
              </div>

              <div className="admin-table-shell">
                {adminsLoading ? (
                  <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">Loading admin users...</div>
                ) : adminUsers.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">No admin users found.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="admin-data-table w-full">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-left uppercase">Email</th>
                          <th className="px-4 py-3 text-center uppercase">Source</th>
                          <th className="px-4 py-3 text-center uppercase">Status</th>
                          <th className="px-4 py-3 text-right uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers.map((adminUser) => (
                          <tr key={adminUser.email}>
                            <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100 break-all">
                              {adminUser.email}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${
                                adminUser.source === 'bootstrap'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                  : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                              }`}>
                                {adminUser.source === 'bootstrap' ? 'Core' : 'Firestore'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${
                                adminUser.active
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                              }`}>
                                {adminUser.active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {adminUser.source === 'bootstrap' ? (
                                <span className="text-xs text-gray-500 dark:text-gray-400">Fixed</span>
                              ) : (
                                <button
                                  onClick={() => handleToggleAdminUser(adminUser)}
                                  disabled={adminSaving}
                                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50 ${
                                    adminUser.active
                                      ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300'
                                      : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300'
                                  }`}
                                >
                                  {adminUser.active ? 'Deactivate' : 'Activate'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Information Card */}
          <div className="mt-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-green-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="font-semibold text-green-900 dark:text-green-300 mb-1">Cloud Storage Enabled</h3>
                <p className="text-sm text-green-800 dark:text-green-200">
                  Settings are stored in Firebase Firestore and synced across all devices. Changes are saved
                  permanently and accessible from any admin session. Room prices and availability are managed
                  through the Room Management section.
                </p>
              </div>
            </div>
          </div>
        </div>
      </AdminMainContent>
    </div>
  );
}

