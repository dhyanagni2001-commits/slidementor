(() => {
  "use strict";

  const MAX_TEXT_CHARS = 4000;

  function detectPlatform() {
    const url = window.location.href;
    if (url.includes("docs.google.com/presentation")) return "google_slides";
    return "pdf_viewer";
  }

  function extractAllVisibleText() {
    // CRITICAL: Remove our own panel from the DOM temporarily while reading
    const panel = document.getElementById("sm-root-panel");
    if (panel) panel.style.display = "none";

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const el = node.parentElement;
          if (!el) return NodeFilter.FILTER_REJECT;

          // Skip our own injected panel
          if (el.closest("#sm-root-panel")) return NodeFilter.FILTER_REJECT;
          if (el.closest("#sm-highlight-tooltip")) return NodeFilter.FILTER_REJECT;

          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
            return NodeFilter.FILTER_REJECT;
          }
          const text = node.textContent.trim();
          if (text.length < 2) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const texts = [];
    let node;
    while ((node = walker.nextNode())) {
      texts.push(node.textContent.trim());
    }

    // Restore panel
    if (panel) panel.style.display = "";

    return [...new Set(texts)].join("\n").slice(0, MAX_TEXT_CHARS);
  }

  function extractGoogleSlidesText() {
    const slideCanvas = document.querySelector(
      ".punch-present-iframe, .punch-viewer-content, [role='main'] .punch-slide"
    );
    if (!slideCanvas) return extractAllVisibleText();

    const textNodes = slideCanvas.querySelectorAll(
      "[data-ved] span, .punch-viewer-slide-object-text span, .punch-line-break, [jsname] span"
    );
    const lines = new Set();
    textNodes.forEach((el) => {
      const t = el.innerText?.trim();
      if (t && t.length > 1) lines.add(t);
    });
    const result = [...lines].join("\n");
    return result.length > 30 ? result.slice(0, MAX_TEXT_CHARS) : extractAllVisibleText();
  }

  function sanitizeText(raw) {
    if (!raw || typeof raw !== "string") return "";
    return raw
      .replace(/```[\s\S]*?```/g, "[code block removed]")
      .replace(/<\|.*?\|>/g, "")
      .replace(/\[INST\]|\[\/INST\]|<s>|<\/s>/gi, "")
      .replace(/ignore previous instructions?/gi, "[filtered]")
      .replace(/system prompt|jailbreak|disregard/gi, "[filtered]")
      .replace(/\s{4,}/g, "\n\n")
      .trim();
  }

  function extractSlideMetadata() {
    const title = document.title || "Untitled Slide";
    return { title: sanitizeText(title), slideIndex: 0, totalSlides: 1 };
  }

  function extractCurrentSlide() {
    const platform = window.__SlideMentor?.platform ?? detectPlatform();
    let rawText = "";

    if (platform === "google_slides") {
      rawText = extractGoogleSlidesText();
    } else {
      rawText = extractAllVisibleText();
    }

    const text = sanitizeText(rawText);
    const isImageHeavy = !text || text.trim().length < 30;
    const metadata = extractSlideMetadata();

    return { text, isImageHeavy, metadata };
  }

  window.__SlideMentor = window.__SlideMentor || {};
  window.__SlideMentor.platform = detectPlatform();
  window.__SlideMentor.extractCurrentSlide = extractCurrentSlide;
  window.__SlideMentor.sanitizeText = sanitizeText;
  window.__SlideMentor.detectImageHeavy = (t) => !t || t.trim().length < 30;
  window.__SlideMentor.getCurrentSlideIndex = () => 0;
})();