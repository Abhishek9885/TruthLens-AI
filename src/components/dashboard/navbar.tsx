"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

interface DashboardNavbarProps {
  onMenuClick: () => void;
}

export function DashboardNavbar({ onMenuClick }: DashboardNavbarProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.profile) {
          setProfile(data.profile as Profile);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : profile?.email?.[0]?.toUpperCase() ?? "U";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border/50 bg-navy-950/80 backdrop-blur-md">
      <div className="flex items-center justify-between h-full px-4 sm:px-6">
        {/* Left: menu button + search */}
        <div className="flex items-center gap-3 flex-1">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="hidden sm:flex relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search claims, sources…"
              className="pl-10 bg-navy-800 border-border/50 h-9 text-sm"
            />
          </div>
        </div>

        {/* Right: role badge + notifications + profile */}
        <div className="flex items-center gap-2">
          {profile && (
            <Badge
              variant="outline"
              className="hidden sm:inline-flex border-blue-accent/30 bg-blue-accent/10 text-blue-glow text-xs uppercase"
            >
              {profile.role}
            </Badge>
          )}

          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-4.5 w-4.5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-danger" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center justify-center rounded-full h-9 w-9 hover:bg-muted transition-colors cursor-pointer outline-none">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-blue-accent/20 text-blue-accent text-sm font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {profile?.full_name || "Authenticated User"}
                  </p>
                  {profile?.email && (
                    <p className="text-xs leading-none text-muted-foreground truncate">
                      {profile.email}
                    </p>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/dashboard/submit")}>
                Submit Content
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/dashboard")}>
                Dashboard
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
