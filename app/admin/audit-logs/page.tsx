"use client";
export const dynamic = "force-dynamic";



import { useState, useEffect } from 'react';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import {
  getFailedLoginAttempts,
  getUnauthorizedAttempts,
  getAllAuditLogs,
  getAdminLogs
} from '@/lib/auditLog';

interface AuditLog {
  id?: string;
  adminEmail: string;
  action: string;
  page: string;
  timestamp?: any;
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failed' | 'unauthorized';
  details?: string;
}

export default function AuditLogsPage() {
  const { isAuthenticated, isLoading } = useProtectedAdminPage();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'failed-logins' | 'unauthorized'>('all');
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      fetchLogs();
    }
  }, [isAuthenticated, isLoading, activeTab]);

  const fetchLogs = async () => {
    setPageLoading(true);
    try {
      let fetchedLogs: AuditLog[] = [];

      if (activeTab === 'all') {
        fetchedLogs = await getAllAuditLogs(100);
      } else if (activeTab === 'failed-logins') {
        fetchedLogs = await getFailedLoginAttempts(100);
      } else if (activeTab === 'unauthorized') {
        fetchedLogs = await getUnauthorizedAttempts(100);
      }

      setLogs(fetchedLogs);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setPageLoading(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">✓ Success</span>;
      case 'failed':
        return <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">✗ Failed</span>;
      case 'unauthorized':
        return <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-medium">⚠ Unauthorized</span>;
      default:
        return <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium">{status}</span>;
    }
  };

  const getActionBadge = (action: string) => {
    const colors: { [key: string]: string } = {
      'login_attempt': 'bg-blue-100 text-blue-800',
      'page_access': 'bg-purple-100 text-purple-800',
      'page_access_attempt': 'bg-yellow-100 text-yellow-800',
    };
    const color = colors[action] || 'bg-gray-100 text-gray-800';
    return <span className={`px-2 py-1 ${color} rounded text-xs font-medium`}>{action}</span>;
  };

  if (!isAuthenticated || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <Header />
        <div className="p-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
            <p className="text-gray-600 mt-2">Track admin access and security events</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mb-6 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('all')}
              className={`pb-4 px-4 font-medium transition-colors ${
                activeTab === 'all'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All Logs
            </button>
            <button
              onClick={() => setActiveTab('failed-logins')}
              className={`pb-4 px-4 font-medium transition-colors ${
                activeTab === 'failed-logins'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Failed Logins
            </button>
            <button
              onClick={() => setActiveTab('unauthorized')}
              className={`pb-4 px-4 font-medium transition-colors ${
                activeTab === 'unauthorized'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Unauthorized Access
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-600">Total Events</div>
              <div className="text-2xl font-bold text-gray-900 mt-2">{logs.length}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-600">Successful</div>
              <div className="text-2xl font-bold text-green-600 mt-2">
                {logs.filter(l => l.status === 'success').length}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-600">Security Alerts</div>
              <div className="text-2xl font-bold text-red-600 mt-2">
                {logs.filter(l => l.status !== 'success').length}
              </div>
            </div>
          </div>

          {/* Logs Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {pageLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading audit logs...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No logs found for this filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Timestamp</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Admin Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Action</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Page</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Details</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">IP Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, index) => (
                      <tr key={log.id || index} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3 text-sm text-gray-900 whitespace-nowrap">
                          {formatDate(log.timestamp)}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-900">
                          {log.adminEmail}
                        </td>
                        <td className="px-6 py-3 text-sm">
                          {getActionBadge(log.action)}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-600">
                          {log.page}
                        </td>
                        <td className="px-6 py-3 text-sm">
                          {getStatusBadge(log.status)}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-600 max-w-xs truncate">
                          {log.details || '-'}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-600 font-mono">
                          {log.ipAddress || 'unknown'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-6 text-sm text-gray-600">
            <p>🔒 All admin activities are recorded for security purposes</p>
            <p>Last updated: {new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
