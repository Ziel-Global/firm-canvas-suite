import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Check, ExternalLink, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { getMyNotifications, markNotificationRead, markAllNotificationsRead } from "@/lib/notifications.functions";
import { cn } from "@/lib/utils";

export function NotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  
  const fetchNotifications = useServerFn(getMyNotifications);
  const markReadFn = useServerFn(markNotificationRead);
  const markAllReadFn = useServerFn(markAllNotificationsRead);

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(),
    refetchInterval: 30000,
  });

  const markAsRead = useMutation({
    mutationFn: (id: string) => markReadFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: () => markAllReadFn(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const unreadCount = notifications?.filter(n => !n.is_read).length ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex size-9 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-frame hover:text-foreground"
        >
          <Bell className="size-5" strokeWidth={1.75} />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-pill bg-priority-high ring-2 ring-canvas" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 border-border bg-canvas shadow-lg" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllAsRead.mutate()}
              disabled={markAllAsRead.isPending}
            >
              Mark all as read
            </Button>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto p-1">
          {isLoading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : !notifications || notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No notifications yet.
            </div>
          ) : (
            notifications.map((n) => (
              <div 
                key={n.id} 
                className={cn(
                  "relative flex flex-col gap-1 rounded-sm px-3 py-2.5 text-sm transition-colors",
                  !n.is_read ? "bg-muted/30" : "hover:bg-muted/10",
                  n.link ? "cursor-pointer" : ""
                )}
                onClick={() => {
                  if (!n.is_read) markAsRead.mutate(n.id);
                  setOpen(false);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  {n.link ? (
                    <Link to={n.link} className="font-medium text-foreground hover:underline">
                      {n.title}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{n.title}</span>
                  )}
                  {!n.is_read && (
                    <div className="mt-1 size-1.5 shrink-0 rounded-full bg-priority-high" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{n.body}</p>
                <span className="text-[10px] text-muted-foreground/60 mt-0.5">
                  {new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
