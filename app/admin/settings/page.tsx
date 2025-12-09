"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function Settings() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useProtectedAdminPage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    hotelName: 'UNITEL Hotel',
    checkInTime: '15:00',
    checkOutTime: '11:00',
    currency: 'PHP',
    contactEmail: 'jambautista@nemsu.edu.ph',
    contactPhone: '+63 123 456 7890',
    address: 'NEMSU, Lianga, Philippines',
  });

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      loadSettings();
    }
  }, [isAuthenticated, isLoading]);

  const loadSettings = async () => {
    try {
      const settingsRef = doc(db, 'settings', 'hotel');
      const settingsDoc = await getDoc(settingsRef);

      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        setSettings({
          hotelName: data.hotelName || 'UNITEL Hotel',
          checkInTime: data.checkInTime || '15:00',
          checkOutTime: data.checkOutTime || '11:00',
          currency: data.currency || 'PHP',
          contactEmail: data.contactEmail || 'admin@unitel.com',
          contactPhone: data.contactPhone || '+63 123 456 7890',
          address: data.address || 'NEMSU, Tangub City, Philippines',
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
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
    const defaultSettings = {
      hotelName: 'UNITEL Hotel',
      checkInTime: '15:00',
      checkOutTime: '11:00',
      currency: 'PHP',
      contactEmail: 'admin@unitel.com',
      contactPhone: '+63 123 456 7890',
      address: 'NEMSU, Tangub City, Philippines',
    };

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
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-50 to-blue-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          <div className="text-xl text-gray-700">Loading settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 via-blue-50 to-indigo-50">
      <Sidebar />
      <Header />

      <main className="lg:ml-64 px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-linear-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Manage hotel configuration and preferences</p>
        </div>

        {/* Settings Form */}
        <div className="max-w-4xl">
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
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
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Hotel Name
                </label>
                <input
                  type="text"
                  name="hotelName"
                  value={settings.hotelName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  placeholder="Enter hotel name"
                />
              </div>

              {/* Contact Email */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Contact Email
                </label>
                <input
                  type="email"
                  name="contactEmail"
                  value={settings.contactEmail}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  placeholder="hotel@example.com"
                />
              </div>

              {/* Contact Phone */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  name="contactPhone"
                  value={settings.contactPhone}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  placeholder="+63 123 456 7890"
                />
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Address
                </label>
                <textarea
                  name="address"
                  value={settings.address}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all resize-none"
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
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Check-in Time
                  </label>
                  <input
                    type="time"
                    name="checkInTime"
                    value={settings.checkInTime}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1">Default check-in time for guests</p>
                </div>

                {/* Check-out Time */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Check-out Time
                  </label>
                  <input
                    type="time"
                    name="checkOutTime"
                    value={settings.checkOutTime}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1">Default check-out time for guests</p>
                </div>
              </div>

              {/* Currency */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Currency
                </label>
                <select
                  name="currency"
                  value={settings.currency}
                  onChange={(e) => handleChange(e as any)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                >
                  <option value="PHP">PHP - Philippine Peso</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={handleReset}
                disabled={saving}
                className="px-6 py-3 rounded-lg font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
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

          {/* Information Card */}
          <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-green-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="font-semibold text-green-900 mb-1">Cloud Storage Enabled</h3>
                <p className="text-sm text-green-800">
                  Settings are stored in Firebase Firestore and synced across all devices. Changes are saved
                  permanently and accessible from any admin session. Room prices and availability are managed
                  through the Room Management section.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
