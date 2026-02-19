"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminMainContent from '../components/AdminMainContent';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import { useKeyboardNavigation } from '@/app/hooks/useKeyboardNavigation';
import { db } from '@/lib/firebase';
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { logError } from '@/lib/logger';
import { COUPON_ICON_OPTIONS, CouponIconKey, getCouponIconMeta, isCouponIconKey } from '@/lib/couponIcons';
import {
  CouponConfig,
  formatCouponDate,
  getCouponAvailability,
  parseCouponDoc,
  sortCouponsByPriority,
  toCouponDocId,
} from '@/lib/coupons';

type CouponFormData = {
  code: string;
  title: string;
  shortDescription: string;
  description: string;
  iconKey: CouponIconKey;
  discountPercent: string;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  termsText: string;
};

const EMPTY_FORM: CouponFormData = {
  code: '',
  title: '',
  shortDescription: '',
  description: '',
  iconKey: 'ticket',
  discountPercent: '10',
  validFrom: '',
  validTo: '',
  isActive: true,
  termsText: '',
};

function toTermsArray(termsText: string) {
  return termsText
    .split('\n')
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function getValidityLabel(coupon: CouponConfig) {
  if (coupon.validFrom && coupon.validTo) {
    return `${formatCouponDate(coupon.validFrom)} - ${formatCouponDate(coupon.validTo)}`;
  }
  if (coupon.validFrom) {
    return `Starts ${formatCouponDate(coupon.validFrom)}`;
  }
  if (coupon.validTo) {
    return `Until ${formatCouponDate(coupon.validTo)}`;
  }
  return 'Ongoing';
}

export default function AdminCouponsPage() {
  const { isAuthenticated, isLoading } = useProtectedAdminPage();
  useKeyboardNavigation();

  const [coupons, setCoupons] = useState<CouponConfig[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CouponFormData>(EMPTY_FORM);

  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribe = onSnapshot(
      collection(db, 'coupons'),
      (snapshot) => {
        const parsedCoupons = snapshot.docs.map((docSnap) =>
          parseCouponDoc(docSnap.id, docSnap.data() as Record<string, unknown>)
        );
        setCoupons(sortCouponsByPriority(parsedCoupons));
        setLoadingCoupons(false);
      },
      (error) => {
        logError(error, { context: 'Admin Coupons - listener error' });
        setCoupons([]);
        setLoadingCoupons(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated]);

  const filteredCoupons = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return coupons;

    return coupons.filter((coupon) =>
      coupon.code.toLowerCase().includes(q) ||
      coupon.title.toLowerCase().includes(q) ||
      coupon.shortDescription.toLowerCase().includes(q) ||
      coupon.description.toLowerCase().includes(q)
    );
  }, [coupons, searchQuery]);

  const openCreateForm = () => {
    setEditingCouponId(null);
    setFormData(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const openEditForm = (coupon: CouponConfig) => {
    setEditingCouponId(coupon.id);
    setFormData({
      code: coupon.code,
      title: coupon.title,
      shortDescription: coupon.shortDescription,
      description: coupon.description,
      iconKey: isCouponIconKey(coupon.iconKey) ? coupon.iconKey : 'ticket',
      discountPercent: String(coupon.discountPercent),
      validFrom: coupon.validFrom || '',
      validTo: coupon.validTo || '',
      isActive: coupon.isActive,
      termsText: coupon.terms.join('\n'),
    });
    setIsFormOpen(true);
  };

  const handleDeleteCoupon = async (coupon: CouponConfig) => {
    const confirmation = await Swal.fire({
      icon: 'warning',
      title: 'Delete Coupon?',
      text: `This will permanently delete ${coupon.title}.`,
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });

    if (!confirmation.isConfirmed) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'coupons', coupon.id));
      Swal.fire({
        icon: 'success',
        title: 'Deleted',
        text: 'Coupon was deleted successfully.',
        confirmButtonColor: '#3b82f6',
      });
    } catch (error) {
      logError(error, { context: 'Admin Coupons - delete coupon error', couponId: coupon.id });
      Swal.fire({
        icon: 'error',
        title: 'Delete failed',
        text: 'Unable to delete coupon. Please try again.',
        confirmButtonColor: '#3b82f6',
      });
    }
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const trimmedCode = formData.code.trim().toUpperCase();
    const trimmedTitle = formData.title.trim();
    const shortDescription = formData.shortDescription.trim();
    const description = formData.description.trim();
    const discountPercent = Number(formData.discountPercent);
    const validFrom = formData.validFrom || null;
    const validTo = formData.validTo || null;

    if (!trimmedCode) {
      Swal.fire({ icon: 'warning', title: 'Code required', text: 'Please provide a coupon code.' });
      return;
    }
    if (!trimmedTitle) {
      Swal.fire({ icon: 'warning', title: 'Title required', text: 'Please provide a coupon title.' });
      return;
    }
    if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
      Swal.fire({ icon: 'warning', title: 'Invalid discount', text: 'Discount must be between 1 and 100.' });
      return;
    }
    if (validFrom && validTo && validFrom > validTo) {
      Swal.fire({ icon: 'warning', title: 'Invalid date range', text: 'Event end date must be after start date.' });
      return;
    }

    const terms = toTermsArray(formData.termsText);
    const couponPayload = {
      code: trimmedCode,
      title: trimmedTitle,
      shortDescription: shortDescription || description || 'Limited-time offer.',
      description: description || shortDescription || 'Limited-time offer.',
      iconKey: formData.iconKey,
      discountPercent: Math.round(discountPercent),
      validFrom,
      validTo,
      isActive: formData.isActive,
      terms,
      updatedAt: serverTimestamp(),
    };

    try {
      setSaving(true);

      if (editingCouponId) {
        await updateDoc(doc(db, 'coupons', editingCouponId), couponPayload);
      } else {
        const couponId = toCouponDocId(trimmedCode || trimmedTitle);
        if (!couponId) {
          Swal.fire({ icon: 'warning', title: 'Invalid code', text: 'Please use letters/numbers for coupon code.' });
          setSaving(false);
          return;
        }

        const existingCoupon = coupons.find((coupon) => coupon.id === couponId);
        if (existingCoupon) {
          Swal.fire({
            icon: 'warning',
            title: 'Duplicate code',
            text: 'A coupon with this code already exists. Use another code or edit the existing coupon.',
          });
          setSaving(false);
          return;
        }

        await setDoc(doc(db, 'coupons', couponId), {
          ...couponPayload,
          createdAt: serverTimestamp(),
        });
      }

      Swal.fire({
        icon: 'success',
        title: editingCouponId ? 'Coupon updated' : 'Coupon created',
        text: editingCouponId
          ? 'Changes were saved successfully.'
          : 'New coupon is now available to client and admin booking forms.',
        confirmButtonColor: '#3b82f6',
      });

      setIsFormOpen(false);
      setEditingCouponId(null);
      setFormData(EMPTY_FORM);
    } catch (error) {
      logError(error, { context: 'Admin Coupons - save coupon error', couponId: editingCouponId });
      Swal.fire({
        icon: 'error',
        title: 'Save failed',
        text: 'Unable to save coupon. Please try again.',
        confirmButtonColor: '#3b82f6',
      });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !isAuthenticated) {
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
        <div className="admin-page-header mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Coupon Management</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
              Create event-based coupons and manage availability for client/admin bookings.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateForm}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Add Coupon
          </button>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search coupon code or title..."
            className="w-full md:w-96 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
        </div>

        {loadingCoupons ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-8 text-center text-gray-600 dark:text-gray-300">
            Loading coupons...
          </div>
        ) : filteredCoupons.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-8 text-center text-gray-600 dark:text-gray-300">
            No coupons found.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredCoupons.map((coupon) => {
              const availability = getCouponAvailability(coupon);
              const iconMeta = getCouponIconMeta(coupon.iconKey);
              return (
                <div key={coupon.id} className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-100 dark:border-gray-700 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">{coupon.code}</p>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">{coupon.title}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{coupon.shortDescription}</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                      {coupon.discountPercent}% OFF
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <div className={`w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center ${iconMeta.iconClass}`}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconMeta.path} />
                      </svg>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Icon: <span className="font-semibold">{iconMeta.label}</span>
                    </p>
                  </div>

                  <div className="mt-4 space-y-2 text-sm">
                    <p className="text-gray-700 dark:text-gray-200">
                      <span className="font-semibold">Event Window:</span> {getValidityLabel(coupon)}
                    </p>
                    <p className={`font-semibold ${availability.active ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                      {availability.active ? 'Active now' : `Unavailable now${availability.reason ? `: ${availability.reason}` : ''}`}
                    </p>
                    <p className={`font-semibold ${coupon.isActive ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                      {coupon.isActive ? 'Enabled by admin' : 'Disabled by admin'}
                    </p>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEditForm(coupon)}
                      className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCoupon(coupon)}
                      className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isFormOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
              <form onSubmit={handleSaveCoupon} className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {editingCouponId ? 'Edit Coupon' : 'Create Coupon'}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
                    aria-label="Close coupon form"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Coupon Code</label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                      placeholder="XMAS2026"
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Discount %</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={formData.discountPercent}
                      onChange={(e) => setFormData((prev) => ({ ...prev, discountPercent: e.target.value }))}
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Short Description</label>
                  <input
                    type="text"
                    value={formData.shortDescription}
                    onChange={(e) => setFormData((prev) => ({ ...prev, shortDescription: e.target.value }))}
                    placeholder="Shown in coupon cards"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Coupon Icon
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {COUPON_ICON_OPTIONS.map((icon) => {
                      const isSelected = formData.iconKey === icon.key;
                      return (
                        <button
                          key={icon.key}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, iconKey: icon.key }))}
                          className={`rounded-lg border p-2 flex flex-col items-center justify-center gap-1 transition-colors ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                          title={icon.label}
                          aria-label={`Use ${icon.label} icon`}
                        >
                          <div className={`w-8 h-8 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 flex items-center justify-center ${icon.iconClass}`}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon.path} />
                            </svg>
                          </div>
                          <span className="text-[10px] leading-tight text-center text-gray-600 dark:text-gray-300">
                            {icon.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Event Start Date</label>
                    <input
                      type="date"
                      value={formData.validFrom}
                      onChange={(e) => setFormData((prev) => ({ ...prev, validFrom: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Event End Date</label>
                    <input
                      type="date"
                      value={formData.validTo}
                      onChange={(e) => setFormData((prev) => ({ ...prev, validTo: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Terms & Conditions (one per line)
                  </label>
                  <textarea
                    value={formData.termsText}
                    onChange={(e) => setFormData((prev) => ({ ...prev, termsText: e.target.value }))}
                    rows={5}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Enabled (allows redemption if date window is valid)
                </label>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white"
                  >
                    {saving ? 'Saving...' : editingCouponId ? 'Save Changes' : 'Create Coupon'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </AdminMainContent>
    </div>
  );
}
