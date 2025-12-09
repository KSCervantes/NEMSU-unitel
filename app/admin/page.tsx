"use client";
export const dynamic = "force-dynamic";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db, storage } from '@/lib/firebase';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
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

  const handleGoogleSignIn = async () => {
    setError('');
    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);

      const userEmail = userCredential.user.email || '';

      // First check: Must be a NEMSU institution email
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
        setError('Access denied. Only @nemsu.edu.ph institutional email addresses are allowed.');
        return;
      }

      // Second check: Must be in the authorized admin list
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
        setError('Access denied. Your email is not authorized to access the admin panel. Please contact the system administrator.');
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
        adminEmail: 'unknown',
        action: 'login_attempt',
        page: '/admin',
        status: 'failed',
        details: err.code || 'Unknown error',
      });

      // Handle Firebase errors
      switch (err.code) {
        case 'auth/popup-closed-by-user':
          setError('Sign-in popup was closed');
          break;
        case 'auth/cancelled-popup-request':
          setError('Sign-in was cancelled');
          break;
        case 'auth/popup-blocked':
          setError('Popup was blocked by browser');
          break;
        default:
          setError('Failed to sign in with Google. Please try again.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1a3a52' }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Admin Login</h1>
          <p className="text-gray-600">UNITEL Hotel Management</p>
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

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="mt-4 w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold transition-all hover:bg-gray-50 hover:border-gray-400 hover:shadow-md disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {isLoading ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </div>

        <div className="mt-6 text-center">
        </div>
      </div>
    </div>
  );
}
