// worker.js — Background Service Worker (Manifest V3)
// Handles API calls, screenshot capture, and message routing

"use strict";

// ─── Config ────────────────────────────────────────────────────────────────

const CONFIG = {
  BACKEND_URL: "http://localhost:8000", // Update after deploy
  REQUEST_TIMEOUT_MS: 25000,
  MAX_RETRIES: 1,
};

// ─── Screenshot Capture ────────────────────────────────────────────────────

async function captureVisibleTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    
    // Try captureVisibleTab first
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "jpeg",
        quality: 65,
      });
      return dataUrl;
    } catch (e) {
      // Fallback: ask content script to capture via html2canvas
      console.warn("[SlideMentor] captureVisibleTab failed, trying fallback:", e.message);
      return null;
    }
  } catch (err) {
    console.warn("[SlideMentor] Screenshot capture failed:", err.message);
    return null;
  }
}

// ─── API Request Handler ───────────────────────────────────────────────────

async function callBackend(endpoint, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${CONFIG.BACKEND_URL}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.detail || `HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new Error("Request timed out. Please try again.");
    throw err;
  }
}

// ─── Message Router ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Handle async by returning true and calling sendResponse later
  // Get cookies for authenticated PDF fetching
  if (msg.type === "SM_GET_COOKIES") {
    (async () => {
      try {
        const url = msg.url;
        const hostname = new URL(url).hostname;
        const [direct, parent] = await Promise.all([
          chrome.cookies.getAll({ domain: hostname }),
          chrome.cookies.getAll({ domain: hostname.split(".").slice(-2).join(".") }),
        ]);
        const all = [...direct, ...parent];
        const cookieObj = {};
        all.forEach(c => { cookieObj[c.name] = c.value; });
        sendResponse({ cookies: cookieObj });
      } catch (e) {
        sendResponse({ cookies: {} });
      }
    })();
    return true;
  }
  
  (async () => {
    try {
      switch (msg.type) {
        case "SM_CAPTURE_SCREENSHOT": {
          const dataUrl = await captureVisibleTab();
          sendResponse({ dataUrl });
          break;
        }

        case "SM_API_REQUEST": {
          const result = await callBackend(msg.endpoint, msg.payload);
          sendResponse(result);
          break;
        }

        case "SM_EXPLAIN_SELECTION": {
          const result = await callBackend("explain-selection", {
            selectedText: msg.selectedText,
            slideContext: msg.slideContext,
            mode: msg.mode,
          });

          // Route result back to content script
          if (sender.tab?.id) {
            chrome.tabs.sendMessage(sender.tab.id, {
              type: "SM_SELECTION_RESULT",
              ...result,
            });
          }
          sendResponse({ ok: true });
          break;
        }

        case "SM_PLATFORM_DETECTED": {
          // Log for debugging; could be stored if needed
          console.log("[SlideMentor] Platform:", msg.platform, "URL:", msg.url);
          sendResponse({ ok: true });
          break;
        }

        default:
          sendResponse({ error: "Unknown message type" });
      }
    } catch (err) {
      console.error("[SlideMentor] Worker error:", err);
      sendResponse({ error: err.message });
    }
  })();

  return true; // Keep channel open for async sendResponse
});

// ─── Extension Icon Click → Toggle Panel ──────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "SM_TOGGLE_PANEL" }).catch(() => {
    // Content script may not be injected yet (non-matching page)
    console.warn("[SlideMentor] Could not toggle panel — content script not active.");
  });
});
