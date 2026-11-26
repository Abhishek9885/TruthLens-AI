"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  LayoutDashboard,
  FilePlus2,
  Search,
  BarChart3,
  Globe,
  FileText,
  Settings,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Submit Content", href: "/dashboard/submit", icon: FilePlus2 },
  { name: "Verify Claims", href: "/dashboard/verify", icon: Search },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Sources", href: "/dashboard/sources", icon: Globe },
  { name: "Threat Alerts", href: "/dashboard/alerts", icon: AlertTriangle },
  { name: "Reports", href: "/dashboard/reports", icon: FileText },
];

const secondaryNavigation = [
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

interface DashboardSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function DashboardSidebar({ open, onClose }: DashboardSidebarProps) {
  const pathname = usePathname();

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Shield className="h-7 w-7 text-blue-accent" />
          <span className="text-lg font-bold text-foreground tracking-tight">
            TruthLens<span className="text-blue-accent"> AI</span>
          </span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <Separator className="bg-border/50" />

      {/* Primary nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-accent/10 text-blue-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-navy-700/50"
              )}
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Secondary nav */}
      <div className="px-3 pb-4 space-y-1">
        <Separator className="bg-border/50 mb-3" />
        {secondaryNavigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-accent/10 text-blue-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-navy-700/50"
              )}
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-navy-900 border-r border-border/50 transform transition-transform lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col bg-navy-900 border-r border-border/50">
        {sidebarContent}
      </aside>
    </>
  );
}
