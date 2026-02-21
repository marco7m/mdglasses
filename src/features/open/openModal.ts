import { open } from "@tauri-apps/plugin-dialog";
import { showError } from "../../ui/notifications";

export interface OpenModalElements {
  openModal: HTMLElement;
  openModalFolder: HTMLButtonElement;
  openModalFile: HTMLButtonElement;
  openModalCancel: HTMLButtonElement;
  btnOpen: HTMLButtonElement;
}

export interface OpenModalActions {
  loadWiki: (path: string) => Promise<void>;
  loadFile: (path: string) => Promise<void>;
}

export function setupOpenModal(elements: OpenModalElements, actions: OpenModalActions): void {
  const { openModal, openModalFolder, openModalFile, openModalCancel, btnOpen } = elements;
  const overlay = openModal.querySelector(".modal-overlay");
  const modalBox = openModal.querySelector(".modal-box");

  function closeOpenModal(): void {
    openModal.classList.add("hidden");
    openModal.setAttribute("aria-hidden", "true");
    btnOpen.focus();
  }

  function showOpenModal(): void {
    openModal.classList.remove("hidden");
    openModal.setAttribute("aria-hidden", "false");
    openModalFolder.focus();
  }

  btnOpen.addEventListener("click", () => showOpenModal());
  if (overlay) overlay.addEventListener("click", () => closeOpenModal());
  if (modalBox) modalBox.addEventListener("click", (e) => e.stopPropagation());

  openModalFolder.addEventListener("click", async () => {
    closeOpenModal();
    try {
      const path = await open({ directory: true });
      if (path && typeof path === "string") await actions.loadWiki(path);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Erro ao abrir pasta");
    }
  });

  openModalFile.addEventListener("click", async () => {
    closeOpenModal();
    try {
      const path = await open({ multiple: false, filters: [{ name: "Markdown", extensions: ["md"] }] });
      if (path && typeof path === "string") await actions.loadFile(path);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Erro ao abrir ficheiro");
    }
  });

  openModalCancel.addEventListener("click", () => closeOpenModal());
  openModal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeOpenModal();
      e.preventDefault();
    }
  });
}
