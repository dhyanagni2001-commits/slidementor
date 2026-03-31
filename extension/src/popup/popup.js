async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const openBtn = document.getElementById("open-panel-btn");
  const platformText = document.getElementById("platform-text");

  const url = tab.url || "";
  const supported =
    url.includes("brightspace") ||
    url.includes("docs.google.com") ||
    url.includes("drive.google.com") ||
    url.startsWith("file://");

  if (platformText) {
    platformText.textContent = supported ? "✓ Ready" : "Navigate to a PDF page";
    platformText.style.color = supported ? "#4ade80" : "#f87171";
  }

  if (openBtn) {
    openBtn.addEventListener("click", async () => {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "SM_TOGGLE_PANEL" });
      } catch (e) {
        console.warn("SlideMentor: content script not ready", e);
      }
      window.close();
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
