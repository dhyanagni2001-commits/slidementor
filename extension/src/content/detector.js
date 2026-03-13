// detector.js — Detects slide platform and signals readiness
// Runs first among content scripts

(() => {
  "use strict";

  const PLATFORMS = {
    GOOGLE_SLIDES: "google_slides",
    PDF_VIEWER: "pdf_viewer",
    UNKNOWN: "unknown",
  };

  function detectPlatform() {
    const url = window.location.href;
    if (url.includes("docs.google.com/presentation")) return PLATFORMS.GOOGLE_SLIDES;
    if (url.includes("brightspace.usc.edu")) return PLATFORMS.PDF_VIEWER;
    if (url.includes("drive.google.com/file") || url.endsWith(".pdf")) return PLATFORMS.PDF_VIEWER;
    return PLATFORMS.UNKNOWN;
  }

  function detectImageHeavy(slideText) {
    // Heuristic: fewer than 30 chars of text = likely image/diagram heavy
    return !slideText || slideText.trim().length < 30;
  }

  function getCurrentSlideIndex() {
    // Google Slides: parse hash or aria-selected
    const selected = document.querySelector(
      ".punch-filmstrip-thumbnail[aria-selected='true']"
    );
    if (selected) {
      const all = [...document.querySelectorAll(".punch-filmstrip-thumbnail")];
      return all.indexOf(selected);
    }
    return 0;
  }

  // Expose to other scripts via window namespace (same-origin content scripts share window)
  window.__SlideMentor = window.__SlideMentor || {};
  window.__SlideMentor.platform = detectPlatform();
  window.__SlideMentor.detectImageHeavy = detectImageHeavy;
  window.__SlideMentor.getCurrentSlideIndex = getCurrentSlideIndex;

  // Notify background worker that we are active
  chrome.runtime.sendMessage({
    type: "SM_PLATFORM_DETECTED",
    platform: window.__SlideMentor.platform,
    url: window.location.href,
  });
})();
