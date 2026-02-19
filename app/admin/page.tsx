"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { auth } from '@/lib/firebase';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { isNemsuEmail } from '@/lib/adminAuth';
import { isAuthorizedAdminUser } from '@/lib/adminUsers';
import { logAdminActivity } from '@/lib/auditLog';
import { useHotelSettings } from '@/app/hooks/useHotelSettings';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const LOGIN_GUARD_STORAGE_KEY = 'admin_login_guard_v1';

type LoginGuard = {
  failedAttempts: number;
  lockoutUntil: number | null;
};

function readLoginGuard(): LoginGuard {
  if (typeof window === 'undefined') {
    return { failedAttempts: 0, lockoutUntil: null };
  }

  try {
    const raw = localStorage.getItem(LOGIN_GUARD_STORAGE_KEY);
    if (!raw) return { failedAttempts: 0, lockoutUntil: null };
    const parsed = JSON.parse(raw) as Partial<LoginGuard>;
    const failedAttempts = Number.isInteger(parsed.failedAttempts) && (parsed.failedAttempts || 0) >= 0
      ? Number(parsed.failedAttempts)
      : 0;
    const lockoutUntil = typeof parsed.lockoutUntil === 'number' && Number.isFinite(parsed.lockoutUntil)
      ? parsed.lockoutUntil
      : null;
    return { failedAttempts, lockoutUntil };
  } catch {
    return { failedAttempts: 0, lockoutUntil: null };
  }
}

function writeLoginGuard(guard: LoginGuard) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOGIN_GUARD_STORAGE_KEY, JSON.stringify(guard));
}

function formatCountdown(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;
  return `${minutesPart}:${secondsPart.toString().padStart(2, '0')}`;
}

export default function AdminLogin() {
  const router = useRouter();
  const { settings: hotelSettings } = useHotelSettings(true);
  const [credentials, setCredentials] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [guard, setGuard] = useState<LoginGuard>({ failedAttempts: 0, lockoutUntil: null });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setGuard(readLoginGuard());
    setNow(Date.now());
  }, []);

  const lockoutRemainingMs = useMemo(() => {
    if (!guard.lockoutUntil) return 0;
    return Math.max(0, guard.lockoutUntil - now);
  }, [guard.lockoutUntil, now]);

  const isLocked = lockoutRemainingMs > 0;
  const attemptsLeft = Math.max(0, MAX_FAILED_ATTEMPTS - guard.failedAttempts);

  useEffect(() => {
    if (!isLocked) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isLocked]);

  useEffect(() => {
    if (!guard.lockoutUntil) return;
    if (guard.lockoutUntil <= Date.now()) {
      const resetGuard: LoginGuard = { failedAttempts: 0, lockoutUntil: null };
      setGuard(resetGuard);
      writeLoginGuard(resetGuard);
    }
  }, [guard.lockoutUntil, now]);

  const recordFailedAttempt = () => {
    const currentGuard = readLoginGuard();
    if (currentGuard.lockoutUntil && currentGuard.lockoutUntil > Date.now()) {
      setGuard(currentGuard);
      return { locked: true, lockoutUntil: currentGuard.lockoutUntil };
    }

    const nextFailedAttempts = currentGuard.failedAttempts + 1;
    if (nextFailedAttempts >= MAX_FAILED_ATTEMPTS) {
      const nextLockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
      const nextGuard: LoginGuard = { failedAttempts: 0, lockoutUntil: nextLockoutUntil };
      setGuard(nextGuard);
      writeLoginGuard(nextGuard);
      return { locked: true, lockoutUntil: nextLockoutUntil };
    }

    const nextGuard: LoginGuard = { failedAttempts: nextFailedAttempts, lockoutUntil: null };
    setGuard(nextGuard);
    writeLoginGuard(nextGuard);
    return { locked: false, attemptsLeft: MAX_FAILED_ATTEMPTS - nextFailedAttempts };
  };

  const clearFailedAttempts = () => {
    const nextGuard: LoginGuard = { failedAttempts: 0, lockoutUntil: null };
    setGuard(nextGuard);
    writeLoginGuard(nextGuard);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRecoveryMessage('');

    if (isLocked) {
      setError(`Too many failed attempts. Please wait ${formatCountdown(lockoutRemainingMs)} before trying again.`);
      return;
    }

    setIsLoading(true);

    try {
      // Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(
        auth,
        credentials.email,
        credentials.password
      );

      const userEmail = (userCredential.user.email || '').toLowerCase().trim();

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
        const lockResult = recordFailedAttempt();
        if (lockResult.locked) {
          const remaining = lockResult.lockoutUntil ? formatCountdown(lockResult.lockoutUntil - Date.now()) : '10:00';
          setError(`Too many failed attempts. Login is temporarily locked for ${remaining}.`);
        } else {
          setError(`Access denied. Only @nemsu.edu.ph institutional emails are allowed. ${lockResult.attemptsLeft} attempt(s) left.`);
        }
        return;
      }

      const allowedAdmin = await isAuthorizedAdminUser(userEmail);
      if (!allowedAdmin) {
        await auth.signOut();
        setIsLoading(false);
        await logAdminActivity({
          adminEmail: userEmail,
          action: 'login_attempt',
          page: '/admin',
          status: 'failed',
          details: 'Not in whitelist',
        });
        const lockResult = recordFailedAttempt();
        if (lockResult.locked) {
          const remaining = lockResult.lockoutUntil ? formatCountdown(lockResult.lockoutUntil - Date.now()) : '10:00';
          setError(`Too many failed attempts. Login is temporarily locked for ${remaining}.`);
        } else {
          setError(`Access denied. Your email is not authorized to access the admin panel. ${lockResult.attemptsLeft} attempt(s) left.`);
        }
        return;
      }

      // Store user session
      sessionStorage.setItem('adminAuth', 'true');
      sessionStorage.setItem('adminEmail', userEmail);
      clearFailedAttempts();

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

      const lockResult = recordFailedAttempt();
      if (lockResult.locked) {
        const remaining = lockResult.lockoutUntil ? formatCountdown(lockResult.lockoutUntil - Date.now()) : '10:00';
        setError(`Too many failed attempts. Login is temporarily locked for ${remaining}.`);
        return;
      }

      // Handle Firebase errors
      switch (err.code) {
        case 'auth/invalid-email':
          setError(`Invalid email address. ${lockResult.attemptsLeft} attempt(s) left.`);
          break;
        case 'auth/user-disabled':
          setError(`This account has been disabled. ${lockResult.attemptsLeft} attempt(s) left.`);
          break;
        case 'auth/user-not-found':
          setError(`No account found with this email. ${lockResult.attemptsLeft} attempt(s) left.`);
          break;
        case 'auth/wrong-password':
          setError(`Incorrect password. ${lockResult.attemptsLeft} attempt(s) left.`);
          break;
        case 'auth/invalid-credential':
          setError(`Invalid email or password. ${lockResult.attemptsLeft} attempt(s) left.`);
          break;
        default:
          setError(`Failed to login. Please try again. ${lockResult.attemptsLeft} attempt(s) left.`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRecoveryMessage('');
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    });
  };

  const handleRecovery = async () => {
    setError('');
    setRecoveryMessage('');

    const email = credentials.email.trim().toLowerCase();
    if (!email) {
      setRecoveryMessage('Enter your admin email first, then click Recover Password.');
      return;
    }

    if (!isNemsuEmail(email)) {
      setRecoveryMessage('Password recovery is available only for @nemsu.edu.ph accounts.');
      return;
    }

    setIsRecovering(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setRecoveryMessage('If your account exists, a password reset link has been sent to your email.');
    } catch {
      // Avoid account enumeration details.
      setRecoveryMessage('If your account exists, a password reset link has been sent to your email.');
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1a3a52' }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
                <Image
                  src="/img/NEMSU_LOGOO.webp"
                  alt={`${hotelSettings.hotelName} Logo`}
                  width={160}
                  height={64}
                  className="h-30 w-auto mx-auto"
                />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Admin Login</h1>
          <p className="text-gray-600">{hotelSettings.hotelName}</p>
        </div>

        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded">
          <p className="text-red-700 font-semibold text-sm">
            Important: Use your admin credentials to access this panel. Unauthorized access is prohibited and logged.
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
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={handleRecovery}
                disabled={isRecovering || isLoading}
                className="text-sm text-blue-700 hover:text-blue-800 underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRecovering ? 'Sending reset link...' : 'Recover Password'}
              </button>
              {!isLocked && guard.failedAttempts > 0 && (
                <span className="text-xs text-amber-700 font-medium">
                  {attemptsLeft} attempt(s) left
                </span>
              )}
            </div>
          </div>

          {isLocked && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
              Too many failed attempts. Try again in <span className="font-semibold">{formatCountdown(lockoutRemainingMs)}</span>.
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {recoveryMessage && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
              {recoveryMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || isLocked}
            className="w-full text-white py-3 rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
            style={{ backgroundColor: '#1a3a52' }}
            onMouseEnter={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#0f2537')}
            onMouseLeave={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#1a3a52')}
          >
            {isLocked ? `Try again in ${formatCountdown(lockoutRemainingMs)}` : isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="mt-6 text-center">
        </div>
      </div>
    </div>
  );
}
