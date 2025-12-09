"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminMainContent from '../components/AdminMainContent';
import { useProtectedAdminPage } from '../hooks/useProtectedAdminPage';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import EmptyState from '@/app/components/EmptyState';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import ModalWithFocusTrap from '@/app/components/ModalWithFocusTrap';
import { useKeyboardNavigation } from '@/app/hooks/useKeyboardNavigation';

interface MaintenanceTask {
  id: string;
  title: string;
  room: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in-progress' | 'completed';
  assignedTo: string;
  dueDate: string;
  description: string;
  createdAt?: any;
}

export default function Maintenance() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useProtectedAdminPage();
  
  // Enable keyboard navigation
  useKeyboardNavigation();
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<MaintenanceTask | null>(null);

  // Fetch rooms from Firestore
  const [availableRooms, setAvailableRooms] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    room: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    status: 'pending' as 'pending' | 'in-progress' | 'completed',
    assignedTo: '',
    dueDate: '',
    description: ''
  });

  // Fetch rooms from Firestore
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchRooms = async () => {
      try {
        const roomsRef = collection(db, 'rooms');
        const snapshot = await getDocs(roomsRef);
        const roomNames: string[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.name) {
            roomNames.push(data.name);
          }
        });
        setAvailableRooms(roomNames);
      } catch (error) {
        console.error('Error fetching rooms:', error);
        setAvailableRooms([]);
      }
    };

    fetchRooms();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const q = query(collection(db, 'maintenance'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasksData: MaintenanceTask[] = [];
      snapshot.forEach((doc) => {
        tasksData.push({
          id: doc.id,
          ...doc.data()
        } as MaintenanceTask);
      });
      setTasks(tasksData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  const handleOpenModal = (task?: MaintenanceTask) => {
    if (task) {
      setEditingTask(task);
      setFormData({
        title: task.title,
        room: task.room,
        priority: task.priority,
        status: task.status,
        assignedTo: task.assignedTo,
        dueDate: task.dueDate,
        description: task.description
      });
    } else {
      setEditingTask(null);
      setFormData({
        title: '',
        room: '',
        priority: 'medium',
        status: 'pending',
        assignedTo: '',
        dueDate: '',
        description: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
    setFormData({
      title: '',
      room: '',
      priority: 'medium',
      status: 'pending',
      assignedTo: '',
      dueDate: '',
      description: ''
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const roomSlug = formData.room ? formData.room.toLowerCase().trim().replace(/\s+/g, '-') : undefined;
      if (editingTask) {
        // Update existing task
        await updateDoc(doc(db, 'maintenance', editingTask.id), {
          ...formData,
          roomSlug,
          updatedAt: serverTimestamp()
        });
      } else {
        // Create new task
        await addDoc(collection(db, 'maintenance'), {
          ...formData,
          roomSlug,
          createdAt: serverTimestamp()
        });
      }
      handleCloseModal();
    } catch (error) {
      console.error('Error saving task:', error);
      alert('Failed to save maintenance task');
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: 'pending' | 'in-progress' | 'completed') => {
    try {
      await updateDoc(doc(db, 'maintenance', taskId), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
      case 'medium':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
      case 'low':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

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
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Maintenance Management</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
              Track and manage all maintenance tasks efficiently
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Task
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Tasks</p>
            <p className="text-3xl font-semibold text-gray-900 dark:text-white">{tasks.length}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Pending</p>
            <p className="text-3xl font-semibold text-gray-900 dark:text-white">
              {tasks.filter(t => t.status === 'pending').length}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">In Progress</p>
            <p className="text-3xl font-semibold text-gray-900 dark:text-white">
              {tasks.filter(t => t.status === 'in-progress').length}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Completed</p>
            <p className="text-3xl font-semibold text-gray-900 dark:text-white">
              {tasks.filter(t => t.status === 'completed').length}
            </p>
          </div>
        </div>

        {/* Tasks List */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-2xl shadow-xl overflow-hidden border border-gray-200/50 dark:border-gray-700/50 hover:shadow-2xl transition-all duration-300">
          <div className="px-6 py-5 border-b border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-blue-50/50 via-indigo-50/50 to-transparent dark:from-gray-800/50 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-400/5 to-indigo-400/5"></div>
            <div className="relative flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-blue-500 via-indigo-600 to-blue-600 rounded-xl shadow-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">All Maintenance Tasks</h2>
              <span className="ml-auto px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-sm font-medium">
                {tasks.length} Total
              </span>
            </div>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? (
              <div className="p-12">
                <LoadingSpinner size="lg" text="Loading maintenance tasks..." />
              </div>
            ) : tasks.length === 0 ? (
              <div className="p-12">
                <EmptyState
                  title="No maintenance tasks found"
                  description="Create your first maintenance task to track room repairs and maintenance schedules."
                  icon={
                    <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  }
                  action={
                    <button
                      onClick={() => handleOpenModal()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                      Create First Task
                    </button>
                  }
                />
              </div>
            ) : (
              tasks.map((task) => (
                <div key={task.id} className="p-5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-l-4 border-transparent hover:border-blue-500">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="grow">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{task.title}</h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${getPriorityColor(task.priority)}`}>
                          {task.priority === 'high' && '🔴'} {task.priority === 'medium' && '🟡'} {task.priority === 'low' && '🟢'} {task.priority}
                        </span>
                        <span className={`px-3 py-1.5 text-xs font-bold rounded-lg ${getStatusColor(task.status)} capitalize shadow-sm`}>
                          {task.status.replace('-', ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 leading-relaxed">{task.description}</p>
                      <div className="flex items-center gap-4 text-sm flex-wrap">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          <span className="font-medium">{task.room}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="font-medium">{task.assignedTo}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-lg">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="font-medium">Due: {new Date(task.dueDate).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {task.status === 'completed' ? (
                        <div className="flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl border-2 border-green-300 dark:border-green-700">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="font-bold text-sm">✅ Completed</span>
                        </div>
                      ) : (
                        <>
                          <select
                            value={task.status}
                            onChange={(e) => handleStatusChange(task.id, e.target.value as any)}
                            className="px-4 py-2 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-medium transition-all cursor-pointer hover:border-blue-400"
                          >
                            <option value="pending">⏳ Pending</option>
                            <option value="in-progress">⚡ In Progress</option>
                            <option value="completed">✅ Completed</option>
                          </select>
                          <button
                            onClick={() => handleOpenModal(task)}
                            className="group px-5 py-2 bg-linear-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 text-sm shadow-md hover:shadow-lg flex items-center gap-2"
                          >
                            <svg className="w-4 h-4 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Add/Edit Task Modal */}
        {isModalOpen && (
          <ModalWithFocusTrap
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            title={editingTask ? 'Edit Task' : 'New Maintenance Task'}
          >
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
                <div>
                  <label className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                    <span className="text-red-500">*</span> Task Title
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="e.g., AC Repair, Plumbing Check"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                    <span className="text-red-500">*</span> Room
                  </label>
                  <select
                    required
                    value={formData.room}
                    onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer"
                  >
                    <option value="">🏨 Select Room</option>
                    {availableRooms.map((room) => (
                      <option key={room} value={room}>🚪 {room}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                      <span className="text-red-500">*</span> Priority
                    </label>
                    <select
                      required
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                      className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer"
                    >
                      <option value="low">🟢 Low</option>
                      <option value="medium">🟡 Medium</option>
                      <option value="high">🔴 High</option>
                    </select>
                  </div>

                  <div>
                    <label className="flex text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 items-center gap-2">
                      <span className="text-red-500">*</span> Status
                    </label>
                    <select
                      required
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                      className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer"
                    >
                      <option value="pending">⏳ Pending</option>
                      <option value="in-progress">⚡ In Progress</option>
                      <option value="completed">✅ Completed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="flex text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 items-center gap-2">
                    <span className="text-red-500">*</span> Assigned To
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.assignedTo}
                    onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="e.g., John Maintenance"
                  />
                </div>

                <div>
                  <label className="flex text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 items-center gap-2">
                    <span className="text-red-500">*</span> Due Date
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>

                <div>
                  <label className="flex text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 items-center gap-2">
                    <span className="text-red-500">*</span> Description
                  </label>
                  <textarea
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
                    placeholder="Describe the maintenance issue in detail..."
                  />
                </div>

                <div className="flex gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="submit"
                    className="flex-1 bg-linear-to-r from-blue-600 to-indigo-600 text-white px-6 py-3.5 rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                  >
                    {editingTask ? (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Update Task
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Create Task
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-6 py-3.5 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300"
                  >
                    Cancel
                  </button>
                </div>
            </form>
          </ModalWithFocusTrap>
        )}
      </AdminMainContent>
    </div>
  );
}
