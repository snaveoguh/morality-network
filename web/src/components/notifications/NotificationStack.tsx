"use client";

import { useNotification } from "@/providers/NotificationProvider";
import { NotificationToast } from "./NotificationToast";

/**
 * Positioned container that stacks visible toasts.
 * Desktop: bottom-right above the 3D pooter.
 * Mobile: bottom-center full-width.
 */
export function NotificationStack() {
  const { notifications, dismiss } = useNotification();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-col-reverse gap-2 lg:bottom-28 max-lg:inset-x-4">
      {notifications.map((n) => (
        <NotificationToast key={n.id} notification={n} onDismiss={dismiss} />
      ))}
    </div>
  );
}
