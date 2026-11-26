"use client";

import { useState, Suspense } from "react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardNavbar } from "@/components/dashboard/navbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-navy-950 flex">
      {/* Sidebar */}
      <Suspense fallback={<aside className="hidden lg:block w-64 bg-navy-900 border-r border-border/50" />}>
        <DashboardSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </Suspense>

      {/* Main content area */}
      <div className="flex-1 flex flex-col lg:pl-64">
        <DashboardNavbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
