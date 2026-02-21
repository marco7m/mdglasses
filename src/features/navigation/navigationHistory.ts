export interface HistoryEntry {
  path: string;
  mode: "file" | "wiki";
  timestamp: number;
}

const MAX_HISTORY_SIZE = 50;

class NavigationHistory {
  private history: HistoryEntry[] = [];
  private currentIndex: number = -1;

  addEntry(path: string, mode: "file" | "wiki"): void {
    // Remove entries after current index if we're not at the end
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // Don't add if it's the same as current entry
    if (
      this.currentIndex >= 0 &&
      this.history[this.currentIndex]?.path === path &&
      this.history[this.currentIndex]?.mode === mode
    ) {
      return;
    }

    const entry: HistoryEntry = {
      path,
      mode,
      timestamp: Date.now(),
    };

    this.history.push(entry);

    // Limit history size
    if (this.history.length > MAX_HISTORY_SIZE) {
      this.history.shift();
    } else {
      this.currentIndex = this.history.length - 1;
    }
  }

  canGoBack(): boolean {
    return this.currentIndex > 0;
  }

  canGoForward(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  goBack(): HistoryEntry | null {
    if (!this.canGoBack()) {
      return null;
    }
    this.currentIndex--;
    return this.history[this.currentIndex];
  }

  goForward(): HistoryEntry | null {
    if (!this.canGoForward()) {
      return null;
    }
    this.currentIndex++;
    return this.history[this.currentIndex];
  }

  getCurrent(): HistoryEntry | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.history.length) {
      return null;
    }
    return this.history[this.currentIndex];
  }

  clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }

  getHistory(): readonly HistoryEntry[] {
    return [...this.history];
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }
}

export const navigationHistory = new NavigationHistory();
