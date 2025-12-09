"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminMainContent from '../components/AdminMainContent';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { sanitizeHtml, sanitizeText } from '@/lib/sanitize';
import { logError } from '@/lib/logger';
import { getEnhancedErrorMessage } from '@/lib/errorMessages';
import EmptyState from '@/app/components/EmptyState';
import { useFocusTrap } from '@/app/hooks/useFocusTrap';
import { useKeyboardNavigation } from '@/app/hooks/useKeyboardNavigation';
import { initCSRF, getCSRFToken } from '@/lib/csrf';
import ModalWithFocusTrap from '@/app/components/ModalWithFocusTrap';

interface Booking {
  id: string;
  name: string;
  surname: string;
  email: string;
  mobile: string;
  phone?: string;
  room: string;
  checkIn: string;
  checkOut: string;
  guests: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  createdAt: any;
  street?: string;
  street1?: string;
  region?: string;
  province?: string;
  city?: string;
  barangay?: string;
  zip?: string;
  country?: string;
  fax?: string;
  jobTitle?: string;
  company?: string;
  message?: string;
  payment?: {
    nights: number;
    guests: number;
    basePrice: number;
    extraFee: number;
    total: number;
  };
}

export default function Reservations() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useProtectedAdminPage();
  
  // Enable keyboard navigation
  useKeyboardNavigation();
  
  // Initialize CSRF token
  useEffect(() => {
    if (typeof window !== 'undefined') {
      initCSRF();
    }
  }, []);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Booking>>({
    name: '',
    surname: '',
    email: '',
    mobile: '',
    phone: '',
    room: '',
    checkIn: '',
    checkOut: '',
    guests: '1',
    status: 'pending',
    street: '',
    street1: '',
    region: '',
    province: '',
    city: '',
    barangay: '',
    zip: '',
    country: 'Philippines',
    fax: '',
    jobTitle: '',
    company: '',
    message: ''
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (expandedBooking && !(event.target as Element).closest('.relative')) {
        setExpandedBooking(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expandedBooking]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookingsData: Booking[] = [];
      snapshot.forEach((doc) => {
        bookingsData.push({
          id: doc.id,
          ...doc.data()
        } as Booking);
      });
      setBookings(bookingsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  // Fetch available rooms
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const q = query(collection(db, 'rooms'));
        const snapshot = await getDocs(q);
        const roomsData = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name
        }));
        setRooms(roomsData.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (error) {
        logError('Error fetching rooms:', error);
      }
    };
    fetchRooms();
  }, []);

  const updateBookingStatus = async (bookingId: string, newStatus: 'pending' | 'confirmed' | 'cancelled' | 'completed') => {
    try {
      // Get booking details before updating
      const booking = bookings.find(b => b.id === bookingId);

      await updateDoc(doc(db, 'bookings', bookingId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        ...(newStatus === 'completed' && { completedAt: serverTimestamp() })
      });

      // Send email notification if booking found and status is confirmed or cancelled
      if (booking && (newStatus === 'confirmed' || newStatus === 'cancelled')) {
        try {
          const { generateBookingApprovedEmail, generateBookingRejectedEmail } = await import('@/lib/emailTemplates');

          const emailHtml = newStatus === 'confirmed'
            ? generateBookingApprovedEmail(
                `${booking.name} ${booking.surname}`,
                bookingId,
                booking.room,
                new Date(booking.checkIn).toLocaleDateString('en-US', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                }),
                new Date(booking.checkOut).toLocaleDateString('en-US', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                }),
                parseInt(booking.guests)
              )
            : generateBookingRejectedEmail(
                `${booking.name} ${booking.surname}`,
                bookingId,
                booking.room,
                new Date(booking.checkIn).toLocaleDateString('en-US', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                }),
                new Date(booking.checkOut).toLocaleDateString('en-US', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                }),
                'Room not available for selected dates'
              );

          await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: booking.email,
              subject: newStatus === 'confirmed'
                ? `Booking Confirmed - NEMSU Hotel (ID: ${bookingId})`
                : `Booking Update - NEMSU Hotel (ID: ${bookingId})`,
              html: emailHtml,
              type: newStatus
            })
          });
        } catch (emailError) {
          logError('Failed to send email notification:', emailError);
          // Don't block the status update if email fails
        }
      }

      const statusText = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
      Swal.fire({
        icon: 'success',
        title: 'Status Updated!',
        text: `Booking status changed to ${statusText}. Email notification sent to guest.`,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } catch (error) {
      logError('Error updating booking status:', error);
      const errorDetails = getEnhancedErrorMessage(error);
      Swal.fire({
        icon: 'error',
        title: errorDetails.title,
        html: `<p>${errorDetails.message}</p>${errorDetails.action ? `<p class="mt-2 text-sm text-gray-600">${errorDetails.action}</p>` : ''}`,
        confirmButtonColor: '#3b82f6'
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
      case 'pending':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
      case 'cancelled':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
      case 'completed':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
    }
  };

  const deleteBooking = async (bookingId: string) => {
    const result = await Swal.fire({
      title: 'Delete Reservation?',
      text: 'This action cannot be undone',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, delete it',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    try {
      await Swal.fire({
        title: 'Deleting...',
        didOpen: async () => {
          Swal.showLoading();
          await deleteDoc(doc(db, 'bookings', bookingId));
          Swal.hideLoading();
        },
        willClose: () => {}
      });
      Swal.fire({
        icon: 'success',
        title: 'Deleted!',
        text: 'Reservation has been deleted successfully',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } catch (error) {
      logError('Error deleting booking:', error);
      const errorDetails = getEnhancedErrorMessage(error);
      Swal.fire({
        icon: 'error',
        title: errorDetails.title,
        html: `<p>${errorDetails.message}</p>${errorDetails.action ? `<p class="mt-2 text-sm text-gray-600">${errorDetails.action}</p>` : ''}`,
        confirmButtonColor: '#3b82f6'
      });
    }
  };

  const printBooking = (booking: Booking) => {
    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) return;

    // Sanitize all user input to prevent XSS
    const safeName = sanitizeText(booking.name);
    const safeSurname = sanitizeText(booking.surname);
    const safeEmail = sanitizeText(booking.email);
    const safeMobile = sanitizeText(booking.mobile);
    const safePhone = booking.phone ? sanitizeText(booking.phone) : '';
    const safeRoom = sanitizeText(booking.room);
    const safeStreet = booking.street ? sanitizeText(booking.street) : '';
    const safeCity = booking.city ? sanitizeText(booking.city) : '';
    const safeProvince = booking.province ? sanitizeText(booking.province) : '';
    const safeMessage = booking.message ? sanitizeHtml(booking.message) : '';

    printWindow.document.write(`
      <html>
        <head>
          <title>Reservation - ${safeName} ${safeSurname}</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: 'Inter', Arial, sans-serif;
              background: #f8fafc;
              color: #1e293b;
              padding: 0;
              margin: 0;
            }
            .container {
              max-width: 700px;
              margin: 40px auto;
              background: #fff;
              border-radius: 16px;
              box-shadow: 0 4px 24px rgba(30, 64, 175, 0.08);
              padding: 32px 40px;
            }
            h1 {
              color: #2563eb;
              font-size: 2.2rem;
              font-weight: 700;
              margin-bottom: 12px;
              text-align: center;
            }
            .section {
              margin: 32px 0;
            }
            .section-title {
              font-size: 1.2rem;
              font-weight: 600;
              color: #334155;
              margin-bottom: 18px;
              border-bottom: 1px solid #e5e7eb;
              padding-bottom: 6px;
            }
            .info-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 12px;
            }
            .info-table td {
              padding: 8px 0;
              vertical-align: top;
            }
            .label {
              font-weight: 600;
              color: #64748b;
              width: 180px;
              display: inline-block;
            }
            .value {
              color: #1e293b;
              font-weight: 400;
              display: inline-block;
            }
            .payment-summary {
              background: #f1f5f9;
              border-radius: 10px;
              padding: 18px 24px;
              margin-top: 10px;
              margin-bottom: 10px;
            }
            .total {
              font-size: 1.3rem;
              font-weight: 700;
              color: #16a34a;
              margin-top: 10px;
            }
            .footer {
              text-align: center;
              color: #64748b;
              margin-top: 40px;
              font-size: 1rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>UNITEL Hotel Reservation</h1>
            <div class="section">
              <div class="section-title">Guest Information</div>
              <table class="info-table">
                <tr><td class="label">Name:</td><td class="value">${safeName} ${safeSurname}</td></tr>
                <tr><td class="label">Email:</td><td class="value">${safeEmail}</td></tr>
                <tr><td class="label">Mobile:</td><td class="value">${safeMobile}</td></tr>
                ${safePhone ? `<tr><td class="label">Phone:</td><td class="value">${safePhone}</td></tr>` : ''}
              </table>
            </div>
            <div class="section">
              <div class="section-title">Booking Details</div>
              <table class="info-table">
                <tr><td class="label">Room:</td><td class="value">${safeRoom}</td></tr>
                <tr><td class="label">Check-in:</td><td class="value">${new Date(booking.checkIn).toLocaleDateString()}</td></tr>
                <tr><td class="label">Check-out:</td><td class="value">${new Date(booking.checkOut).toLocaleDateString()}</td></tr>
                <tr><td class="label">Guests:</td><td class="value">${sanitizeText(booking.guests)}</td></tr>
                <tr><td class="label">Status:</td><td class="value">${sanitizeText(booking.status.toUpperCase())}</td></tr>
              </table>
            </div>
            ${booking.payment ? `
            <div class="section">
              <div class="section-title">Payment Details</div>
              <div class="payment-summary">
                <div><span class="label">Nights:</span> <span class="value">${booking.payment.nights}</span></div>
                <div><span class="label">Base Price:</span> <span class="value">₱${booking.payment.basePrice.toLocaleString()}</span></div>
                <div><span class="label">Extra Guest Fee:</span> <span class="value">₱${booking.payment.extraFee.toLocaleString()}</span></div>
                <div class="total"><span class="label">Total Payment:</span> ₱${booking.payment.total.toLocaleString()}</div>
              </div>
            </div>` : ''}
            ${(safeStreet || safeCity) ? `
            <div class="section">
              <div class="section-title">Address</div>
              <table class="info-table">
                ${safeStreet ? `<tr><td class="label">Street:</td><td class="value">${safeStreet}</td></tr>` : ''}
                ${safeCity ? `<tr><td class="label">City:</td><td class="value">${safeCity}</td></tr>` : ''}
                ${safeProvince ? `<tr><td class="label">Province:</td><td class="value">${safeProvince}</td></tr>` : ''}
              </table>
            </div>` : ''}
            ${safeMessage ? `
            <div class="section">
              <div class="section-title">Special Requests</div>
              <div class="value">${safeMessage}</div>
            </div>` : ''}
            <div class="footer">Thank you for choosing UNITEL Hotel</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleOpenModal = (booking?: Booking) => {
    if (booking) {
      setEditingBooking(booking);
      setFormData(booking);
    } else {
      setEditingBooking(null);
      setFormData({
        name: '',
        surname: '',
        email: '',
        mobile: '',
        phone: '',
        room: '',
        checkIn: '',
        checkOut: '',
        guests: '1',
        status: 'pending',
        street: '',
        street1: '',
        region: '',
        province: '',
        city: '',
        barangay: '',
        zip: '',
        country: 'Philippines',
        fax: '',
        jobTitle: '',
        company: '',
        message: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingBooking(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Validate CSRF token
    const formDataObj = new FormData(e.currentTarget);
    const csrfToken = formDataObj.get('csrf_token') as string;
    if (!csrfToken || !getCSRFToken() || csrfToken !== getCSRFToken()) {
      Swal.fire({
        icon: 'error',
        title: 'Security Error',
        text: 'Invalid security token. Please refresh the page and try again.',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }
    
    try {
      Swal.fire({
        title: editingBooking ? 'Updating...' : 'Creating...',
        didOpen: async () => {
          Swal.showLoading();
          if (editingBooking) {
            await updateDoc(doc(db, 'bookings', editingBooking.id), {
              ...formData,
              updatedAt: serverTimestamp()
            });
          } else {
            await addDoc(collection(db, 'bookings'), {
              ...formData,
              createdAt: serverTimestamp()
            });
          }
        },
        willClose: () => {}
      });

      Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: editingBooking ? 'Reservation updated successfully' : 'Reservation created successfully',
        confirmButtonColor: '#3b82f6'
      });
      handleCloseModal();
    } catch (error) {
      logError('Error saving booking:', error);
      const errorDetails = getEnhancedErrorMessage(error);
      Swal.fire({
        icon: 'error',
        title: errorDetails.title,
        html: `<p>${errorDetails.message}</p>${errorDetails.action ? `<p class="mt-2 text-sm text-gray-600">${errorDetails.action}</p>` : ''}`,
        confirmButtonColor: '#3b82f6'
      });
    }
  };

  const filteredBookings = (filter === 'all' ? bookings : bookings.filter(b => b.status === filter))
    .filter((b) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        `${b.name} ${b.surname}`.toLowerCase().includes(q) ||
        (b.email || '').toLowerCase().includes(q) ||
        (b.mobile || '').toLowerCase().includes(q) ||
        (b.room || '').toLowerCase().includes(q) ||
        (b.status || '').toLowerCase().includes(q) ||
        new Date(b.checkIn).toLocaleDateString().toLowerCase().includes(q) ||
        new Date(b.checkOut).toLocaleDateString().toLowerCase().includes(q)
      );
    });

  // Pagination
  const totalPages = Math.ceil(filteredBookings.length / itemsPerPage);
  const paginatedBookings = filteredBookings.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery]);

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
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Reservations</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
              Manage all hotel bookings
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Create new reservation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Reservation
          </button>
        </div>

        {/* Search + Filter */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                </svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search reservations…"
                  className="bg-transparent outline-none text-sm font-medium text-gray-700 dark:text-gray-300 placeholder-gray-500 dark:placeholder-gray-400 w-full"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              All ({bookings.length})
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'pending' 
                  ? 'bg-amber-500 text-white' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Pending ({bookings.filter(b => b.status === 'pending').length})
            </button>
            <button
              onClick={() => setFilter('confirmed')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'confirmed' 
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Confirmed ({bookings.filter(b => b.status === 'confirmed').length})
            </button>
            <button
              onClick={() => setFilter('cancelled')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'cancelled' 
                  ? 'bg-red-500 text-white' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Cancelled ({bookings.filter(b => b.status === 'cancelled').length})
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'completed' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Completed ({bookings.filter(b => b.status === 'completed').length})
            </button>
            </div>
          </div>
        </div>

        {/* Reservations Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider border-r border-gray-200 dark:border-gray-600">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider border-r border-gray-200 dark:border-gray-600">Guest Name</th>
                  <th className="relative z-10 px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-blue-500/30">Email</th>
                  <th className="relative z-10 px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-blue-500/30">Mobile</th>
                  <th className="relative z-10 px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-blue-500/30">Phone</th>
                  <th className="relative z-10 px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-blue-500/30">Room</th>
                  <th className="relative z-10 px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-blue-500/30">Check-in</th>
                  <th className="relative z-10 px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-blue-500/30">Check-out</th>
                  <th className="relative z-10 px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-blue-500/30">Guests</th>
                  <th className="relative z-10 px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-blue-500/30">Address</th>
                  <th className="relative z-10 px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-blue-500/30">City/Province</th>
                  <th className="relative z-10 px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-blue-500/30">Company</th>
                  <th className="relative z-10 px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-blue-500/30">Job Title</th>
                  <th className="relative z-10 px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-blue-500/30">Special Requests</th>
                  <th className="relative z-10 px-4 py-4 text-left text-xs font-bold uppercase tracking-wider border-r border-blue-500/30">Status</th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={16} className="px-6 py-12 text-center">
                      <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4"></div>
                      <p className="text-gray-500 dark:text-gray-400 font-medium">Loading reservations...</p>
                    </td>
                  </tr>
                ) : filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="px-6 py-12 text-center">
                      <div className="mx-auto w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <p className="text-gray-500 dark:text-gray-400 font-medium text-lg">No reservations found</p>
                    </td>
                  </tr>
                ) : (
                  paginatedBookings.map((booking, index) => (
                    <tr key={booking.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                        #{(currentPage - 1) * itemsPerPage + index + 1}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                        {booking.name} {booking.surname}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700">
                        {booking.email}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                        {booking.mobile}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                        {booking.phone || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                        {booking.room}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                        {new Date(booking.checkIn).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                        {new Date(booking.checkOut).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 whitespace-nowrap text-center">
                        {booking.guests}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700">
                        {[booking.street, booking.street1, booking.barangay].filter(Boolean).join(', ') || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                        {[booking.city, booking.province].filter(Boolean).join(', ') || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700">
                        {booking.company || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700">
                        {booking.jobTitle || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 max-w-xs">
                        <div className="truncate" title={booking.message}>
                          {booking.message || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                        <span className={`px-3 py-1.5 text-xs font-bold rounded-lg ${getStatusColor(booking.status)} capitalize inline-block`}>
                          {booking.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {/* Status Dropdown */}
                          <div className="relative">
                            <button
                              onClick={() => setOpenDropdown(openDropdown === booking.id ? null : booking.id)}
                              className="p-2 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                              title="Change Status"
                              aria-label={`Change status for ${booking.name} ${booking.surname}`}
                              aria-expanded={openDropdown === booking.id}
                              aria-haspopup="true"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                              </svg>
                            </button>
                            {openDropdown === booking.id && (
                              <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                                <button
                                  onClick={() => {
                                    updateBookingStatus(booking.id, 'confirmed');
                                    setOpenDropdown(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center gap-2 rounded-t-lg transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Accept
                                </button>
                                <button
                                  onClick={() => {
                                    updateBookingStatus(booking.id, 'pending');
                                    setOpenDropdown(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center gap-2 transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  Pending
                                </button>
                                <button
                                  onClick={() => {
                                    updateBookingStatus(booking.id, 'cancelled');
                                    setOpenDropdown(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                  Reject
                                </button>
                                {booking.status === 'confirmed' && (
                                  <button
                                    onClick={() => {
                                      updateBookingStatus(booking.id, 'completed');
                                      setOpenDropdown(null);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2 rounded-b-lg transition-colors"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Mark as Completed
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => printBooking(booking)}
                            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                            title="Print"
                            aria-label={`Print reservation for ${booking.name} ${booking.surname}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleOpenModal(booking)}
                            className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500"
                            title="Edit"
                            aria-label={`Edit reservation for ${booking.name} ${booking.surname}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteBooking(booking.id)}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                            title="Delete"
                            aria-label={`Delete reservation for ${booking.name} ${booking.surname}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredBookings.length > 0 && (
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredBookings.length)} of {filteredBookings.length} reservations
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      // Show first, last, current, and adjacent pages
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                              currentPage === page
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      } else if (
                        page === currentPage - 2 ||
                        page === currentPage + 2
                      ) {
                        return <span key={page} className="text-gray-500 px-1">...</span>;
                      }
                      return null;
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Create/Edit Modal */}
        {isModalOpen && (
          <ModalWithFocusTrap
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            title={editingBooking ? 'Edit Reservation' : 'Create New Reservation'}
          >
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* CSRF Token */}
              <input type="hidden" name="csrf_token" value={getCSRFToken() || ''} />
                {/* Guest Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Guest Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.surname || ''}
                        onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Mobile <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={formData.mobile || ''}
                        onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                      <input
                        type="tel"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Booking Details */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Booking Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Room <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formData.room || ''}
                        onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      >
                        <option value="">-- Select a Room --</option>
                        {rooms.map((room) => (
                          <option key={room.id} value={room.name}>
                            {room.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Number of Guests <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={formData.guests || '1'}
                        onChange={(e) => setFormData({ ...formData, guests: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Check-in Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.checkIn || ''}
                        onChange={(e) => setFormData({ ...formData, checkIn: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Check-out Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.checkOut || ''}
                        onChange={(e) => setFormData({ ...formData, checkOut: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Status <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formData.status || 'pending'}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      >
                        <option value="pending">⏳ Pending</option>
                        <option value="confirmed">✅ Confirmed</option>
                        <option value="cancelled">❌ Cancelled</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Address
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Street Address</label>
                      <input
                        type="text"
                        value={formData.street || ''}
                        onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">City</label>
                      <input
                        type="text"
                        value={formData.city || ''}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Province</label>
                      <input
                        type="text"
                        value={formData.province || ''}
                        onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Company Details */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Company Details (Optional)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company Name</label>
                      <input
                        type="text"
                        value={formData.company || ''}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Job Title</label>
                      <input
                        type="text"
                        value={formData.jobTitle || ''}
                        onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Special Requests */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Special Requests</label>
                  <textarea
                    rows={3}
                    value={formData.message || ''}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="Any special requirements or requests..."
                  />
                </div>

                {/* Form Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-6 py-2.5 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                  >
                    {editingBooking ? 'Update Reservation' : 'Create Reservation'}
                  </button>
                </div>
            </form>
          </ModalWithFocusTrap>
        )}
      </AdminMainContent>
    </div>
  );
}
