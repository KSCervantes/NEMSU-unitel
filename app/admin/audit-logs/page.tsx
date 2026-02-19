"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from 'react';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import AdminMainContent from '../components/AdminMainContent';
import {
  getFailedLoginAttempts,
  getUnauthorizedAttempts,
  getAllAuditLogs
} from '@/lib/auditLog';

interface AuditLog {
  id?: string;
  adminEmail: string;
  action: string;
  page: string;
  timestamp?: { seconds: number; nanoseconds: number } | Date;
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failed' | 'unauthorized';
  details?: string;
}

type AuditFilter = 'all' | 'failed-logins' | 'unauthorized';

export default function AuditLogsPage() {
  const { isAuthenticated, isLoading } = useProtectedAdminPage();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<AuditFilter>('all');
  const [pageLoading, setPageLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setPageLoading(true);
    try {
      let fetchedLogs: AuditLog[] = [];

      if (activeTab === 'all') {
        fetchedLogs = await getAllAuditLogs(100);
      } else if (activeTab === 'failed-logins') {
        fetchedLogs = await getFailedLoginAttempts(100);
      } else {
        fetchedLogs = await getUnauthorizedAttempts(100);
      }

      setLogs(fetchedLogs);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setPageLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      void fetchLogs();
    }
  }, [fetchLogs, isAuthenticated, isLoading]);

  const formatDate = (
    timestamp:
      | { toDate: () => Date }
      | { seconds: number; nanoseconds: number; toDate?: () => Date }
      | Date
      | number
      | null
      | undefined
  ) => {
    if (!timestamp) return 'N/A';
    if (typeof timestamp === 'number') return new Date(timestamp).toLocaleString();
    if (timestamp instanceof Date) return timestamp.toLocaleString();
    if ('toDate' in timestamp && typeof timestamp.toDate === 'function') return timestamp.toDate().toLocaleString();
    if ('seconds' in timestamp) return new Date(timestamp.seconds * 1000).toLocaleString();
    return 'N/A';
  };

  const getStatusBadge = (status: AuditLog['status']) => {
    if (status === 'success') {
      return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Success</span>;
    }
    if (status === 'failed') {
      return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">Failed</span>;
    }
    return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Unauthorized</span>;
  };

  const getActionBadge = (action: string) => {
    const colors: { [key: string]: string } = {
      login_attempt: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      page_access: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
      page_access_attempt: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    };
    const color = colors[action] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    return <span className={`px-2 py-1 rounded text-xs font-semibold ${color}`}>{action}</span>;
  };

  if (!isAuthenticated || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading audit logs...</p>
        </div>
      </div>
    );
  }

  const successCount = logs.filter((log) => log.status === 'success').length;
  const alertsCount = logs.filter((log) => log.status !== 'success').length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <Header />

      <AdminMainContent>
        <div className="admin-page-header mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Audit Logs</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Track admin access, failed logins, and unauthorized activity
          </p>
        </div>

        <div className="mb-6 inline-flex flex-wrap gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 text-sm rounded-md font-medium transition-colors ${
              activeTab === 'all'
                ? 'bg-blue-600 text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            All Logs
          </button>
          <button
            onClick={() => setActiveTab('failed-logins')}
            className={`px-4 py-2 text-sm rounded-md font-medium transition-colors ${
              activeTab === 'failed-logins'
                ? 'bg-blue-600 text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Failed Logins
          </button>
          <button
            onClick={() => setActiveTab('unauthorized')}
            className={`px-4 py-2 text-sm rounded-md font-medium transition-colors ${
              activeTab === 'unauthorized'
                ? 'bg-blue-600 text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Unauthorized Access
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Events</div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-white mt-2">{logs.length}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">Successful</div>
            <div className="text-2xl font-semibold text-green-600 dark:text-green-400 mt-2">{successCount}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">Security Alerts</div>
            <div className="text-2xl font-semibold text-red-600 dark:text-red-400 mt-2">{alertsCount}</div>
          </div>
        </div>

        <div className="admin-table-shell bg-white dark:bg-gray-800">
          {pageLoading ? (
            <div className="p-10 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading audit logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-10 text-center text-gray-500 dark:text-gray-400">
              No logs found for this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="admin-data-table w-full">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left uppercase">Timestamp</th>
                    <th className="px-6 py-3 text-left uppercase">Admin Email</th>
                    <th className="px-6 py-3 text-left uppercase">Action</th>
                    <th className="px-6 py-3 text-left uppercase">Page</th>
                    <th className="px-6 py-3 text-left uppercase">Status</th>
                    <th className="px-6 py-3 text-left uppercase">Details</th>
                    <th className="px-6 py-3 text-left uppercase">IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, index) => (
                    <tr key={log.id || index}>
                      <td className="px-6 py-3 text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        {formatDate(log.timestamp)}
                      </td>
                      <td className="px-6 py-3 text-gray-900 dark:text-gray-100">
                        {log.adminEmail}
                      </td>
                      <td className="px-6 py-3">
                        {getActionBadge(log.action)}
                      </td>
                      <td className="px-6 py-3 admin-cell-muted">
                        {log.page}
                      </td>
                      <td className="px-6 py-3">
                        {getStatusBadge(log.status)}
                      </td>
                      <td className="px-6 py-3 admin-cell-muted max-w-xs truncate">
                        {log.details || '-'}
                      </td>
                      <td className="px-6 py-3 admin-cell-muted font-mono">
                        {log.ipAddress || 'unknown'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          <p>All admin activities are logged for security review.</p>
          <p>Last updated: {new Date().toLocaleString()}</p>
        </div>
      </AdminMainContent>
    </div>
  );
}
