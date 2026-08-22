import { Bell, Menu, Search, LogOut, Shield } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSidebar } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppTopbarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  notificationCount?: number;
  user?: { username: string };
  isAdmin?: boolean;
  onLogout: () => void;
  onOpenOperators?: () => void;
  trailing?: ReactNode;
}

export function AppTopbar({
  search,
  onSearchChange,
  notificationCount = 0,
  user,
  isAdmin,
  onLogout,
  onOpenOperators,
  trailing,
}: AppTopbarProps) {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur sm:px-4 md:h-16">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={toggleSidebar}
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </Button>

      <div className="relative min-w-0 flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange?.(e.target.value)}
          placeholder="Search contacts, lists, tickets…"
          className="h-10 rounded-lg border bg-card pl-9 text-sm"
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        {trailing}
        <ThemeToggle />
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {notificationCount > 0 && (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-0.5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-md hover:bg-primary/10"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                  {(user?.username ?? "?").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {isAdmin && onOpenOperators && (
              <DropdownMenuItem onClick={onOpenOperators}>
                <Shield className="mr-2 h-4 w-4" />
                Team
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
