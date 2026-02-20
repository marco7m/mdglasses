export type NotificationType = "success" | "error" | "info" | "warning";

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
}

let notificationContainer: HTMLElement | null = null;
const activeNotifications = new Map<string, Notification>();
const DEFAULT_DURATION = 5000; // 5 seconds

function ensureContainer(): HTMLElement {
  if (!notificationContainer || !document.body.contains(notificationContainer)) {
    notificationContainer = document.createElement("div");
    notificationContainer.className = "notifications-container";
    document.body.appendChild(notificationContainer);
  }
  return notificationContainer;
}

function createNotificationElement(notification: Notification): HTMLElement {
  const element = document.createElement("div");
  element.className = `notification notification-${notification.type}`;
  element.setAttribute("role", "alert");
  element.setAttribute("aria-live", notification.type === "error" ? "assertive" : "polite");
  element.setAttribute("data-notification-id", notification.id);
  
  const icon = getIconForType(notification.type);
  const message = document.createElement("span");
  message.className = "notification-message";
  message.textContent = notification.message;
  
  const closeBtn = document.createElement("button");
  closeBtn.className = "notification-close";
  closeBtn.setAttribute("aria-label", "Fechar notificação");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => {
    removeNotification(notification.id);
  });
  
  element.appendChild(icon);
  element.appendChild(message);
  element.appendChild(closeBtn);
  
  return element;
}

function getIconForType(type: NotificationType): HTMLElement {
  const icon = document.createElement("span");
  icon.className = "notification-icon";
  const icons: Record<NotificationType, string> = {
    success: "✓",
    error: "✕",
    info: "ℹ",
    warning: "⚠",
  };
  icon.textContent = icons[type];
  return icon;
}

export function showNotification(
  type: NotificationType,
  message: string,
  duration: number = DEFAULT_DURATION
): string {
  const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const notification: Notification = { id, type, message, duration };
  
  activeNotifications.set(id, notification);
  const container = ensureContainer();
  const element = createNotificationElement(notification);
  container.appendChild(element);
  
  // Trigger animation
  requestAnimationFrame(() => {
    element.classList.add("notification-show");
  });
  
  // Auto-dismiss
  if (duration > 0) {
    setTimeout(() => {
      removeNotification(id);
    }, duration);
  }
  
  return id;
}

export function removeNotification(id: string): void {
  const notification = activeNotifications.get(id);
  if (!notification || !notificationContainer) return;
  
  const element = notificationContainer.querySelector(`[data-notification-id="${id}"]`) as HTMLElement;
  if (element) {
    element.classList.add("notification-hide");
    setTimeout(() => {
      element.remove();
      activeNotifications.delete(id);
      
      if (activeNotifications.size === 0 && notificationContainer) {
        notificationContainer.remove();
        notificationContainer = null;
      }
    }, 300); // Match CSS transition duration
  } else {
    activeNotifications.delete(id);
  }
}

export function clearAllNotifications(): void {
  const ids = Array.from(activeNotifications.keys());
  ids.forEach(id => removeNotification(id));
}

// Convenience functions
export function showSuccess(message: string, duration?: number): string {
  return showNotification("success", message, duration);
}

export function showError(message: string, duration?: number): string {
  return showNotification("error", message, duration);
}

export function showInfo(message: string, duration?: number): string {
  return showNotification("info", message, duration);
}

export function showWarning(message: string, duration?: number): string {
  return showNotification("warning", message, duration);
}
