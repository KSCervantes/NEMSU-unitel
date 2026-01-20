"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { isAuthorizedAdmin, isNemsuEmail } from '@/lib/adminAuth';
import { logAdminActivity } from '@/lib/auditLog';

export default function AdminLogin() {
  const router = useRouter();
  const [credentials, setCredentials] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(
        auth,
        credentials.email,
        credentials.password
      );

      const userEmail = userCredential.user.email || '';

      // Validate domain and authorization
      if (!isNemsuEmail(userEmail)) {
        await auth.signOut();
        setIsLoading(false);
        await logAdminActivity({
          adminEmail: userEmail,
          action: 'login_attempt',
          page: '/admin',
          status: 'failed',
          details: 'Invalid domain',
        });
        setError('Access denied. Only @nemsu.edu.ph institutional emails are allowed.');
        return;
      }

      if (!isAuthorizedAdmin(userEmail)) {
        await auth.signOut();
        setIsLoading(false);
        await logAdminActivity({
          adminEmail: userEmail,
          action: 'login_attempt',
          page: '/admin',
          status: 'failed',
          details: 'Not in whitelist',
        });
        setError('Access denied. Your email is not authorized to access the admin panel.');
        return;
      }

      // Store user session
      sessionStorage.setItem('adminAuth', 'true');
      sessionStorage.setItem('adminEmail', userEmail);

      // Log successful login
      await logAdminActivity({
        adminEmail: userEmail,
        action: 'login_attempt',
        page: '/admin',
        status: 'success',
      });

      router.push('/admin/dashboard');
    } catch (err: any) {
      setIsLoading(false);

      // Log failed login
      await logAdminActivity({
        adminEmail: credentials.email,
        action: 'login_attempt',
        page: '/admin',
        status: 'failed',
        details: err.code || 'Unknown error',
      });

      // Handle Firebase errors
      switch (err.code) {
        case 'auth/invalid-email':
          setError('Invalid email address');
          break;
        case 'auth/user-disabled':
          setError('This account has been disabled');
          break;
        case 'auth/user-not-found':
          setError('No account found with this email');
          break;
        case 'auth/wrong-password':
          setError('Incorrect password');
          break;
        case 'auth/invalid-credential':
          setError('Invalid email or password');
          break;
        default:
          setError('Failed to login. Please try again.');
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1a3a52' }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
                <Image
                  src="/img/NEMSU_LOGOO.webp"
                  alt="UNITEL Logo"
                  width={160}
                  height={64}
                  className="h-16 w-auto mx-auto"
                />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Admin Login</h1>
          <p className="text-gray-600">UNITEL Hotel Management</p>
        </div>

        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded">
          <p className="text-red-700 font-semibold text-sm">
            ⚠️ Important: Use your admin credentials to access this panel. Unauthorized access is prohibited and logged.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={credentials.email}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-transparent outline-none transition"
              placeholder="admin@unitel.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={credentials.password}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-transparent outline-none transition"
              placeholder="Enter password"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full text-white py-3 rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
            style={{ backgroundColor: '#1a3a52' }}
            onMouseEnter={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#0f2537')}
            onMouseLeave={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#1a3a52')}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="mt-6 text-center">
        </div>
      </div>
    </div>
  );
}
