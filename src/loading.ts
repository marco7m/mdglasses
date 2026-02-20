let loadingContainer: HTMLElement | null = null;
const activeLoadings = new Map<string, { message?: string }>();

function ensureContainer(): HTMLElement {
  if (!loadingContainer || !document.body.contains(loadingContainer)) {
    if (loadingContainer) {
      activeLoadings.clear();
    }
    loadingContainer = document.createElement("div");
    loadingContainer.className = "loading-container";
    loadingContainer.setAttribute("role", "status");
    loadingContainer.setAttribute("aria-live", "polite");
    loadingContainer.setAttribute("aria-label", "Carregando");
    document.body.appendChild(loadingContainer);
  }
  return loadingContainer;
}

function createLoadingElement(id: string, message?: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "loading-indicator";
  element.setAttribute("data-loading-id", id);
  
  const spinner = document.createElement("div");
  spinner.className = "loading-spinner";
  
  const content = document.createElement("div");
  content.className = "loading-content";
  
  if (message) {
    const messageEl = document.createElement("span");
    messageEl.className = "loading-message";
    messageEl.textContent = message;
    content.appendChild(messageEl);
  }
  
  element.appendChild(spinner);
  element.appendChild(content);
  
  return element;
}

export function showLoading(id: string, message?: string): void {
  if (activeLoadings.has(id)) return;
  
  activeLoadings.set(id, { message });
  const container = ensureContainer();
  const element = createLoadingElement(id, message);
  container.appendChild(element);
  
  requestAnimationFrame(() => {
    element.classList.add("loading-show");
  });
}

export function hideLoading(id: string): void {
  if (!activeLoadings.has(id) || !loadingContainer) return;
  
  const element = loadingContainer.querySelector(`[data-loading-id="${id}"]`) as HTMLElement;
  if (element) {
    element.classList.add("loading-hide");
    setTimeout(() => {
      element.remove();
      activeLoadings.delete(id);
      
      if (activeLoadings.size === 0 && loadingContainer) {
        loadingContainer.remove();
        loadingContainer = null;
      }
    }, 300);
  } else {
    activeLoadings.delete(id);
  }
}

export function updateLoadingMessage(id: string, message: string): void {
  if (!activeLoadings.has(id) || !loadingContainer) return;
  
  const element = loadingContainer.querySelector(`[data-loading-id="${id}"]`) as HTMLElement;
  if (element) {
    let messageEl = element.querySelector(".loading-message");
    if (!messageEl) {
      messageEl = document.createElement("span");
      messageEl.className = "loading-message";
      const content = element.querySelector(".loading-content");
      if (content) {
        content.appendChild(messageEl);
      }
    }
    messageEl.textContent = message;
    activeLoadings.set(id, { message });
  }
}

export function clearAllLoadings(): void {
  const ids = Array.from(activeLoadings.keys());
  ids.forEach(id => hideLoading(id));
}

/** Reset module state (for tests). Removes container from DOM and clears state. */
export function resetLoadingState(): void {
  if (loadingContainer?.parentNode) {
    loadingContainer.remove();
  }
  loadingContainer = null;
  activeLoadings.clear();
}
