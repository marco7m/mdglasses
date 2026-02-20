import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  showLoading,
  hideLoading,
  updateLoadingMessage,
  clearAllLoadings,
  resetLoadingState,
} from "./loading";

describe("loading", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetLoadingState();
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearAllLoadings();
    vi.advanceTimersByTime(350);
    vi.useRealTimers();
  });

  it("creates loading container on first loading", () => {
    showLoading("test-1");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    const container = document.querySelector(".loading-container");
    expect(container).toBeTruthy();
  });

  it("creates loading indicator element", () => {
    showLoading("test-1");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    const indicator = document.querySelector(".loading-indicator");
    expect(indicator).toBeTruthy();
    expect(indicator?.getAttribute("data-loading-id")).toBe("test-1");
  });

  it("shows loading message when provided", () => {
    showLoading("test-1", "Carregando arquivo...");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    const message = document.querySelector(".loading-message");
    expect(message?.textContent).toBe("Carregando arquivo...");
  });

  it("does not show message element when message is not provided", () => {
    showLoading("test-1");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    const message = document.querySelector(".loading-message");
    expect(message).toBeFalsy();
  });

  it("supports multiple loadings simultaneously", () => {
    showLoading("test-1", "Loading 1");
    showLoading("test-2", "Loading 2");
    showLoading("test-3", "Loading 3");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    
    const indicators = document.querySelectorAll(".loading-indicator");
    expect(indicators.length).toBe(3);
  });

  it("does not create duplicate loading for same id", () => {
    showLoading("test-1");
    showLoading("test-1");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    
    const indicators = document.querySelectorAll(".loading-indicator");
    expect(indicators.length).toBe(1);
  });

  it("hides loading indicator", () => {
    showLoading("test-1");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    expect(document.querySelector(".loading-indicator")).toBeTruthy();
    
    hideLoading("test-1");
    vi.advanceTimersByTime(300);
    
    expect(document.querySelector(".loading-indicator")).toBeFalsy();
  });

  it("removes container when all loadings are cleared", () => {
    showLoading("test-1");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    expect(document.querySelector(".loading-container")).toBeTruthy();
    
    clearAllLoadings();
    vi.advanceTimersByTime(300);
    expect(document.querySelector(".loading-container")).toBeFalsy();
  });

  it("updates loading message", () => {
    showLoading("test-1", "Initial message");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    let message = document.querySelector(".loading-message");
    expect(message?.textContent).toBe("Initial message");
    
    updateLoadingMessage("test-1", "Updated message");
    message = document.querySelector(".loading-message");
    expect(message?.textContent).toBe("Updated message");
  });

  it("creates message element when updating if it doesn't exist", () => {
    showLoading("test-1");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    expect(document.querySelector(".loading-message")).toBeFalsy();
    
    updateLoadingMessage("test-1", "New message");
    const message = document.querySelector(".loading-message");
    expect(message?.textContent).toBe("New message");
  });

  it("handles hiding non-existent loading gracefully", () => {
    expect(() => hideLoading("non-existent")).not.toThrow();
  });

  it("handles updating non-existent loading gracefully", () => {
    expect(() => updateLoadingMessage("non-existent", "Message")).not.toThrow();
  });

  it("clears all loadings", () => {
    showLoading("test-1");
    showLoading("test-2");
    showLoading("test-3");
    vi.advanceTimersByTime(0); // Allow requestAnimationFrame
    
    expect(document.querySelectorAll(".loading-indicator").length).toBe(3);
    
    clearAllLoadings();
    vi.advanceTimersByTime(300);
    expect(document.querySelectorAll(".loading-indicator").length).toBe(0);
  });
});
