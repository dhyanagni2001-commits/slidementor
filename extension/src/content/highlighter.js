// highlighter.js — Detects text selection and shows an explain tooltip

(() => {
  "use strict";

  const TOOLTIP_ID = "sm-highlight-tooltip";
  const MIN_SELECTION_LENGTH = 5;
  const MAX_SELECTION_LENGTH = 600;

  let tooltipEl = null;
  let debounceTimer = null;

  // ─── Tooltip DOM ──────────────────────────────────────────────────────────

  function createTooltip() {
    if (document.getElementById(TOOLTIP_ID)) return;

    tooltipEl = document.createElement("div");
    tooltipEl.id = TOOLTIP_ID;
    tooltipEl.setAttribute("aria-live", "polite");
    tooltipEl.innerHTML = `
      <div class="sm-tooltip-inner">
        <span class="sm-tooltip-icon">✦</span>
        <button class="sm-tooltip-btn" id="sm-explain-btn">Explain this</button>
        <button class="sm-tooltip-btn sm-secondary" id="sm-flash-btn">Flashcard</button>
      </div>
    `;
    document.body.appendChild(tooltipEl);

    document.getElementById("sm-explain-btn").addEventListener("click", () => {
      const selection = window.getSelection()?.toString().trim();
      if (selection) handleExplainSelection(selection, "explain");
      hideTooltip();
    });

    document.getElementById("sm-flash-btn").addEventListener("click", () => {
      const selection = window.getSelection()?.toString().trim();
      if (selection) handleExplainSelection(selection, "flashcard");
      hideTooltip();
    });
  }

  function showTooltip(x, y) {
    if (!tooltipEl) createTooltip();
    tooltipEl.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
    tooltipEl.style.top = `${y - 48}px`;
    tooltipEl.classList.add("sm-tooltip-visible");
  }

  function hideTooltip() {
    tooltipEl?.classList.remove("sm-tooltip-visible");
  }

  // ─── Selection Handler ─────────────────────────────────────────────────────

  function onSelectionChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();

      if (!text || text.length < MIN_SELECTION_LENGTH || text.length > MAX_SELECTION_LENGTH) {
        hideTooltip();
        return;
      }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      showTooltip(
        rect.left + scrollX + rect.width / 2 - 80,
        rect.top + scrollY
      );
    }, 250);
  }

  // ─── Bridge to Panel ───────────────────────────────────────────────────────

  function handleExplainSelection(selectedText, mode) {
    const sanitized = window.__SlideMentor?.sanitizeText?.(selectedText) ?? selectedText;
    const slideContext = window.__SlideMentor?.extractCurrentSlide?.();

    chrome.runtime.sendMessage({
      type: "SM_EXPLAIN_SELECTION",
      selectedText: sanitized,
      slideContext: slideContext?.text ?? "",
      mode, // "explain" | "flashcard"
    });

    // Open the side panel if not already open
    window.__SlideMentor?.openPanel?.();
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest(`#${TOOLTIP_ID}`)) hideTooltip();
  });

  createTooltip();
})();
