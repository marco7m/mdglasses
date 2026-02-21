import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  showNotification,
  removeNotification,
  clearAllNotifications,
  showSuccess,
  showError,
  showInfo,
  showWarning,
} from "./notifications";

describe("notifications", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearAllNotifications();
    vi.useRealTimers();
  });

  it("creates notification container on first notification", () => {
    showNotification("info", "Test message");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    const notificationContainer = document.querySelector(".notifications-container");
    expect(notificationContainer).toBeTruthy();
  });

  it("creates notification element with correct type", () => {
    showNotification("error", "Error message");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    const notification = document.querySelector(".notification-error");
    expect(notification).toBeTruthy();
    expect(notification?.getAttribute("role")).toBe("alert");
    expect(notification?.getAttribute("aria-live")).toBe("assertive");
  });

  it("shows notification message correctly", () => {
    showNotification("success", "Success message");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    const message = document.querySelector(".notification-message");
    expect(message?.textContent).toBe("Success message");
  });

  it("auto-dismisses after default duration", () => {
    showNotification("info", "Test", 1000);
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    expect(document.querySelector(".notification")).toBeTruthy();
    
    vi.advanceTimersByTime(1000);
    
    // Wait for animation
    vi.advanceTimersByTime(300);
    expect(document.querySelector(".notification")).toBeFalsy();
  });

  it("does not auto-dismiss when duration is 0", () => {
    showNotification("info", "Test", 0);
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    vi.advanceTimersByTime(10000);
    expect(document.querySelector(".notification")).toBeTruthy();
  });

  it("supports multiple notifications simultaneously", () => {
    showNotification("info", "First");
    showNotification("error", "Second");
    showNotification("success", "Third");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    
    const notifications = document.querySelectorAll(".notification");
    expect(notifications.length).toBe(3);
  });

  it("removes notification when close button is clicked", () => {
    showNotification("info", "Test");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    const closeBtn = document.querySelector(".notification-close");
    
    expect(closeBtn).toBeTruthy();
    (closeBtn as HTMLElement).click();
    
    vi.advanceTimersByTime(300);
    expect(document.querySelector(".notification")).toBeFalsy();
  });

  it("removes notification by id", () => {
    const id = showNotification("info", "Test");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    expect(document.querySelector(".notification")).toBeTruthy();
    
    removeNotification(id);
    vi.advanceTimersByTime(300);
    expect(document.querySelector(".notification")).toBeFalsy();
  });

  it("clears all notifications", () => {
    showNotification("info", "First");
    showNotification("error", "Second");
    showNotification("success", "Third");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    
    expect(document.querySelectorAll(".notification").length).toBe(3);
    
    clearAllNotifications();
    vi.advanceTimersByTime(300);
    expect(document.querySelectorAll(".notification").length).toBe(0);
  });

  it("removes container when all notifications are cleared", () => {
    showNotification("info", "Test");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    expect(document.querySelector(".notifications-container")).toBeTruthy();
    
    clearAllNotifications();
    vi.advanceTimersByTime(300);
    expect(document.querySelector(".notifications-container")).toBeFalsy();
  });

  it("convenience function showSuccess works", () => {
    showSuccess("Success!");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    const notification = document.querySelector(".notification-success");
    expect(notification).toBeTruthy();
    expect(document.querySelector(".notification-message")?.textContent).toBe("Success!");
  });

  it("convenience function showError works", () => {
    showError("Error!");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    const notification = document.querySelector(".notification-error");
    expect(notification).toBeTruthy();
    expect(document.querySelector(".notification-message")?.textContent).toBe("Error!");
  });

  it("convenience function showInfo works", () => {
    showInfo("Info!");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    const notification = document.querySelector(".notification-info");
    expect(notification).toBeTruthy();
    expect(document.querySelector(".notification-message")?.textContent).toBe("Info!");
  });

  it("convenience function showWarning works", () => {
    showWarning("Warning!");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    const notification = document.querySelector(".notification-warning");
    expect(notification).toBeTruthy();
    expect(document.querySelector(".notification-message")?.textContent).toBe("Warning!");
  });

  it("returns unique id for each notification", () => {
    const id1 = showNotification("info", "First");
    const id2 = showNotification("info", "Second");
    expect(id1).not.toBe(id2);
  });

  it("handles removal of non-existent notification gracefully", () => {
    expect(() => removeNotification("non-existent")).not.toThrow();
  });
});
