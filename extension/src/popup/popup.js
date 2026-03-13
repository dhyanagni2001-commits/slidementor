// popup.js — Popup UI Logic

const PLATFORM_LABELS = {
  google_slides: "Google Slides",
  pdf_viewer: "PDF / Drive Viewer",
  unknown: "Unsupported Page",
};

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  // Detect platform from the active tab
  chrome.tabs.sendMessage(tab.id, { type: "SM_GET_PLATFORM" }, (resp) => {
    const platform = resp?.platform ?? "unknown";
    document.getElementById("platform-text").textContent =
      PLATFORM_LABELS[platform] ?? "Unknown";
  });

  document.getElementById("open-panel-btn").addEventListener("click", async () => {
    await chrome.tabs.sendMessage(tab.id, { type: "SM_TOGGLE_PANEL" });
    window.close();
  });

  document.getElementById("settings-btn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage?.();
  });
}

document.addEventListener("DOMContentLoaded", init);
