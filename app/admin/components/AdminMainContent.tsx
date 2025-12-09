"use client";
export const dynamic = "force-dynamic";

import { useSidebar } from '../context/SidebarContext';

export default function AdminMainContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();

  return (
    <main className={`transition-all duration-300 px-4 sm:px-6 lg:px-8 py-8 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
      {children}
    </main>
  );
}
