// injector.js — SlideMentor (Deep explanations + RAG + metrics display)

(() => {
  "use strict";

  const PANEL_ID = "sm-root-panel";
  const BACKEND_URL = "http://localhost:8000";
  let panelOpen = false;
  let lastExplanation = "";
  let lastPdfData = null;
  let lastPdfFileName = "";
  const chatHistory = [];

  function injectPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.setAttribute("role", "complementary");
    panel.setAttribute("aria-label", "SlideMentor Panel");
    panel.innerHTML = `
      <div id="sm-panel-header">
        <div id="sm-logo">
          <span class="sm-logo-mark">✦</span>
          <span class="sm-logo-text">SlideMentor</span>
        </div>
        <div id="sm-header-actions">
          <button class="sm-icon-btn" id="sm-minimize-btn" title="Minimize">&#x2212;</button>
          <button class="sm-icon-btn" id="sm-close-btn" title="Close">&#x2715;</button>
        </div>
      </div>
      <div id="sm-tabs">
        <button class="sm-tab sm-tab-active" data-tab="explain">Explain</button>
        <button class="sm-tab" data-tab="chat">Chat</button>
        <button class="sm-tab" data-tab="flashcards">Flashcards</button>
      </div>
      <div id="sm-tab-content">
        <div id="sm-tab-explain" class="sm-tab-pane sm-tab-pane-active">
          <div id="sm-action-buttons">
            
            <label id="sm-pdf-label" class="sm-secondary-btn" style="cursor:pointer; margin-top:8px;">
              <span>📄 Upload PDF</span>
              <input type="file" id="sm-pdf-input" accept=".pdf" style="display:none;" />
            </label>
          </div>
          <div id="sm-pdf-pages"></div>
          <div id="sm-explanation-output" class="sm-output-area">
            <div class="sm-placeholder">Loading…</div>
          </div>
          <div id="sm-flashcard-actions" style="display:none; padding: 0 0 12px 0;">
            <button id="sm-gen-flashcards-btn" class="sm-secondary-btn">⚡ Generate Flashcards</button>
          </div>
        </div>
        <div id="sm-tab-chat" class="sm-tab-pane">
          <div id="sm-chat-messages"></div>
          <div id="sm-chat-input-area">
            <textarea id="sm-chat-input" placeholder="Ask a follow-up question…" rows="2" maxlength="500"></textarea>
            <button id="sm-chat-send-btn" class="sm-send-btn" title="Send">&#x27A4;</button>
          </div>
        </div>
        <div id="sm-tab-flashcards" class="sm-tab-pane">
          <div id="sm-flashcard-deck"></div>
          <div id="sm-flashcard-empty" class="sm-placeholder">
            Explain a slide first, then generate flashcards.
          </div>
        </div>
      </div>
      <div id="sm-status-bar">
        <span id="sm-status-text">Ready</span>
        <span id="sm-powered-by">Groq · LLaMA 3</span>
      </div>
    `;
    document.body.appendChild(panel);
    initPanelEvents(panel);

    setTimeout(async () => {
      const url = window.location.href;
      const isPdf = url.includes(".pdf");
      const isLMS = url.includes("brightspace") || url.includes("blackboard") ||
                    url.includes("canvas") || url.includes("moodle") ||
                    url.includes("drive.google") || url.includes("docs.google");
      if (isPdf || isLMS) {
        await autoFetchPdf();
      } else {
        setOutput("<div class='sm-placeholder'>Navigate to a PDF or slide to begin.</div>");
      }
    }, 1000);
  }

  function initPanelEvents(panel) {
    panel.querySelectorAll(".sm-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        panel.querySelectorAll(".sm-tab").forEach(t => t.classList.remove("sm-tab-active"));
        panel.querySelectorAll(".sm-tab-pane").forEach(p => p.classList.remove("sm-tab-pane-active"));
        tab.classList.add("sm-tab-active");
        panel.querySelector(`#sm-tab-${tab.dataset.tab}`)?.classList.add("sm-tab-pane-active");
      });
    });
    // document.getElementById("sm-explain-slide-btn").addEventListener("click", explainCurrentSlide);
    document.getElementById("sm-gen-flashcards-btn").addEventListener("click", generateFlashcards);
    document.getElementById("sm-pdf-input").addEventListener("change", handlePdfUpload);
    document.getElementById("sm-chat-send-btn").addEventListener("click", sendChatMessage);
    document.getElementById("sm-chat-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });
    document.getElementById("sm-close-btn").addEventListener("click", closePanel);
    document.getElementById("sm-minimize-btn").addEventListener("click", minimizePanel);
  }

  // ─── Auto-fetch PDF ────────────────────────────────────────────────────────

  async function autoFetchPdf() {
    const url = window.location.href;
    let pdfUrl = url.includes(".pdf") ? url : await findEmbeddedPdfUrl();
    if (!pdfUrl) {
      setOutput("<div class='sm-placeholder'>No PDF detected. Upload one manually.</div>");
      return;
    }
    setStatus("Auto-loading PDF…");
    setOutput("<div class='sm-loading'><span class='sm-spinner'></span> Fetching PDF…</div>");
    document.getElementById("sm-pdf-pages").innerHTML = "";
    try {
      const cookies = await getBrowserCookies(pdfUrl);
      const res = await fetch(`${BACKEND_URL}/fetch-pdf-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: pdfUrl, cookies }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Fetch failed");
      lastPdfData = data;
      lastPdfFileName = data.filename || "slide.pdf";
      renderPageButtons(data, lastPdfFileName);
      setOutput(`<div class='sm-placeholder'>✓ PDF loaded (${data.total_pages} pages, ${data.chunks || 0} chunks indexed).<br>plain This Slide or pick a page.</div>`);
      setStatus(`Loaded — ${data.total_pages} pages ✓`);
    } catch (err) {
      setOutput(`
        <div style="text-align:center; padding:16px 10px;">
          <p style="color:#f87171; font-size:12px; margin-bottom:8px;">Auto-load failed</p>
          <p style="color:#6b6f7e; font-size:11px; margin-bottom:12px;">${escapeHtml(err.message)}</p>
          <p style="color:#c8a96e; font-size:11px;">👆 Use Upload PDF instead</p>
        </div>`);
      setStatus("Ready");
    }
  }

  async function findEmbeddedPdfUrl() {
    // Brightspace PDF.js viewer — PDF URL is in the iframe's ?file= param
    const iframes = document.querySelectorAll("iframe");
    for (const f of iframes) {
      if (!f.src) continue;
      try {
        const iframeUrl = new URL(f.src);
        // Brightspace pdfjs viewer pattern
        if (f.src.includes("pdfjs") || f.src.includes("viewer.html")) {
          const fileParam = iframeUrl.searchParams.get("file");
          if (fileParam) {
            const decoded = decodeURIComponent(fileParam);
            // Make absolute URL
            if (decoded.startsWith("http")) return decoded;
            return iframeUrl.origin + decoded;
          }
        }
        // Direct PDF iframe
        if (f.src.includes(".pdf")) return f.src;
      } catch(e) {}
    }

    // embed/object tags
    const embed = document.querySelector("embed[src*='.pdf'], embed[type='application/pdf']");
    if (embed?.src && !embed.src.startsWith("chrome-extension://")) return embed.src;

    const obj = document.querySelector("object[data*='.pdf']");
    if (obj?.data) return obj.data;

    // Direct PDF links on page
    const links = document.querySelectorAll("a[href*='.pdf']");
    if (links.length > 0) return links[0].href;

    return null;
  }

  async function getBrowserCookies(url) {
    try {
      const res = await chrome.runtime.sendMessage({ type: "SM_GET_COOKIES", url });
      return res?.cookies || {};
    } catch (e) { return {}; }
  }

  // ─── Explain This Slide ────────────────────────────────────────────────────

  async function explainCurrentSlide() {
    if (lastPdfData) {
      const pageNum = getCurrentPageNumber();
      if (pageNum) {
        const pageData = lastPdfData.pages.find(p => p.page === pageNum);
        if (pageData) {
          await explainPageDirect(pageData, pageNum, lastPdfFileName, lastPdfData);
          return;
        }
      }
      setOutput("<div class='sm-placeholder'>Click a page number in the grid above to explain it.</div>");
      setStatus("Pick a page above");
      return;
    }
    const slideData = window.__SlideMentor?.extractCurrentSlide?.();
    const text = slideData?.text ?? "";
    if (text && text.length > 50) {
      setStatus("Analyzing…");
      setOutput("<div class='sm-loading'><span class='sm-spinner'></span> Deep analysis…</div>");
      try {
        const result = await chrome.runtime.sendMessage({
          type: "SM_API_REQUEST",
          endpoint: "explain-slide",
          payload: { mode: "text", text, metadata: slideData.metadata },
        });
        if (result.error) throw new Error(result.error);
        lastExplanation = result.explanation ?? "";
        setOutput(renderExplanation(result));
        showFlashcardBtn();
        setStatus("Done ✓");
      } catch (err) {
        setOutput(`<div class="sm-error">⚠ ${escapeHtml(err.message)}</div>`);
        setStatus("Error");
      }
      return;
    }
    setOutput(`
      <div style="text-align:center; padding:20px 10px;">
        <div style="font-size:28px; margin-bottom:10px;">📄</div>
        <p style="color:#e8e4d9; font-size:13px; margin-bottom:8px;">No PDF loaded yet</p>
        <p style="color:#6b6f7e; font-size:12px; line-height:1.6;">
          Use <strong style="color:#c8a96e;">Upload PDF</strong> above, or navigate to a PDF page.
        </p>
      </div>`);
    setStatus("Upload PDF to continue");
  }

  function getCurrentPageNumber() {
    const hashPage = window.location.hash.match(/page[=.](\d+)/i);
    if (hashPage) return parseInt(hashPage[1]);
    try {
      const inputs = document.querySelectorAll("input");
      for (const input of inputs) {
        const val = parseInt(input.value);
        if (!isNaN(val) && val > 0 && val <= (lastPdfData?.total_pages || 999)) return val;
      }
    } catch(e) {}
    return null;
  }

  // ─── PDF Upload ────────────────────────────────────────────────────────────

  async function handlePdfUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setStatus("Extracting PDF…");
    setOutput("<div class='sm-loading'><span class='sm-spinner'></span> Reading PDF…</div>");
    document.getElementById("sm-pdf-pages").innerHTML = "";
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${BACKEND_URL}/extract-pdf`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Extraction failed");
      lastPdfData = data;
      lastPdfFileName = file.name;
      renderPageButtons(data, file.name);
      setOutput(`<div class='sm-placeholder'>✓ PDF loaded (${data.total_pages} pages, ${data.chunks || 0} chunks indexed).<br>Click a page to explain it.</div>`);
      setStatus(`PDF loaded — ${data.total_pages} pages`);
    } catch (err) {
      setOutput(`<div class="sm-error">⚠ ${escapeHtml(err.message)}</div>`);
      setStatus("Error");
    }
  }

  // ─── Page grid ─────────────────────────────────────────────────────────────

  function renderPageButtons(data, filename) {
    const pagesDiv = document.getElementById("sm-pdf-pages");
    pagesDiv.innerHTML = `
      <div class="sm-pdf-label">${data.total_pages} pages — <span style="color:#c8a96e">gold</span> = text, dim = image only, <span style="color:#93c5fd">ƒ</span> = math</div>
      <div class="sm-page-grid">
        ${data.pages.map(p => `
          <button class="sm-page-btn ${p.has_text ? 'sm-page-has-text' : 'sm-page-no-text'} ${p.has_math ? 'sm-page-has-math' : ''}"
            data-page="${p.page}" data-text="${escapeAttr(p.text)}"
            data-has-text="${p.has_text}" data-has-images="${p.has_images}"
            data-has-math="${p.has_math || false}"
            data-image-count="${p.image_count}">
            ${p.page}${p.has_math ? '<span class="sm-math-badge">ƒ</span>' : ''}
          </button>`).join("")}
      </div>`;
    pagesDiv.querySelectorAll(".sm-page-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const pageNum = parseInt(btn.dataset.page);
        const pageData = data.pages.find(p => p.page === pageNum);
        explainPageDirect(pageData, pageNum, filename, data);
      });
    });
  }
  // ─── Core explain ──────────────────────────────────────────────────────────

  async function explainPageDirect(pageData, pageNum, filename, data) {
    document.querySelectorAll(".sm-page-btn").forEach(b => b.classList.remove("sm-page-active"));
    document.querySelector(`.sm-page-btn[data-page="${pageNum}"]`)?.classList.add("sm-page-active");

    setStatus(`Deep analysis of page ${pageNum}…`);
    setOutput("<div class='sm-loading'><span class='sm-spinner'></span> Analyzing with RAG…</div>");

    const prevPage = data.pages.find(p => p.page === pageNum - 1);
    const nextPage = data.pages.find(p => p.page === pageNum + 1);

    let screenshotB64 = "";
    if (pageData.has_images || pageData.image_count > 0) {
      // Always try screenshot for vision analysis
    try {
      setStatus("Capturing slide for vision analysis…");
      const dataUrl = await captureScreenshot();
      if (dataUrl) screenshotB64 = dataUrl.split(",")[1];
    } catch(e) {}
    }

    try {
      const res = await fetch(`${BACKEND_URL}/explain-pdf-page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: pageData.text,
          page_number: pageNum,
          total_pages: data.total_pages,
          title: filename.replace(".pdf", ""),
          has_images: pageData.has_images,
          image_count: pageData.image_count,
          prev_page_text: (prevPage?.text || "").slice(0, 400),
          next_page_text: (nextPage?.text || "").slice(0, 400),
          screenshot_b64: screenshotB64,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || "Failed");

      lastExplanation = result.explanation ?? result.summary ?? "";
      chatHistory.length = 0;
      chatHistory.push({ role: "user", content: `Studying page ${pageNum} of ${filename}: ${pageData.text.slice(0, 1000)}` });
      chatHistory.push({ role: "assistant", content: lastExplanation.slice(0, 800) });

      setOutput(renderExplanation(result));
      showFlashcardBtn();

      // Show meta info
      const meta = result._meta;
      if (meta) {
        const cacheStr = meta.cache_hit ? "⚡ cached" : `${meta.latency_ms}ms`;
        const ragStr = meta.rag_chunks_used ? ` · ${meta.rag_chunks_used} RAG chunks` : "";
        const visionStr = meta.vision_used ? " · 👁 vision" : "";
        setStatus(`Page ${pageNum} ✓ — ${cacheStr}${ragStr}${visionStr}`);
      } else {
        setStatus(`Page ${pageNum} explained ✓`);
      }
    } catch (err) {
      setOutput(`<div class="sm-error">⚠ ${escapeHtml(err.message)}</div>`);
      setStatus("Error");
    }
  }

  // ─── Flashcards ────────────────────────────────────────────────────────────

  async function generateFlashcards() {
    if (!lastExplanation) return;
    setStatus("Generating flashcards…");
    try {
      const result = await chrome.runtime.sendMessage({
        type: "SM_API_REQUEST",
        endpoint: "explain-slide",
        payload: { mode: "flashcard", context: lastExplanation },
      });
      if (result.error) throw new Error(result.error);
      renderFlashcards(result.flashcards || []);
      document.querySelector("[data-tab='flashcards']")?.click();
      setStatus("Flashcards ready ✓");
    } catch (err) {
      const msg = err?.message || err?.detail || String(err);
      setStatus(`Flashcard error: ${msg}`);
    }
  }

  // ─── Chat ──────────────────────────────────────────────────────────────────

  async function sendChatMessage() {
  const inputEl = document.getElementById("sm-chat-input");
  const text = inputEl.value.trim();
  if (!text || text.length < 2) return;
  const sanitized = text.replace(/[<>]/g, "");
  inputEl.value = "";
  appendChatMessage("user", sanitized);
  chatHistory.push({ role: "user", content: sanitized });
  setStatus("Thinking…");
  try {
    const cleanHistory = chatHistory
      .slice(-10)
      .filter(t => t && (t.role === "user" || t.role === "assistant"))
      .filter(t => t.content && t.content.trim().length > 0)
      .map(t => ({ role: t.role, content: String(t.content).slice(0, 1500) }));

    const res = await fetch("http://localhost:8000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        history: cleanHistory,
        slideContext: (lastExplanation || "").slice(0, 2000),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    appendChatMessage("assistant", data.reply);
    chatHistory.push({ role: "assistant", content: data.reply });
    setStatus("Ready");
  } catch (err) {
    const msg = err?.message || String(err);
    appendChatMessage("error", `⚠ ${msg}`);
    setStatus("Error");
  }
}

  async function captureScreenshot() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "SM_CAPTURE_SCREENSHOT" }, (res) => {
        resolve(res?.dataUrl ?? null);
      });
    });
  }

  // ─── Render explanation with Deep Dive ────────────────────────────────────

  function renderExplanation(result) {
    const { summary, keyPoints = [], terms = [], deepDive = "", explanation = "" } = result;
    const displaySummary = summary || explanation;
    let html = `<div class="sm-explanation">`;

    if (displaySummary) {
      html += `<p class="sm-summary">${escapeHtml(displaySummary)}</p>`;
    }

    if (keyPoints.length) {
      html += `<h4 class="sm-section-label">Key Points</h4><ul class="sm-key-points">`;
      keyPoints.forEach(pt => { html += `<li>${escapeHtml(pt)}</li>`; });
      html += `</ul>`;
    }

    if (terms.length) {
      html += `<h4 class="sm-section-label">Terms</h4><dl class="sm-terms">`;
      terms.forEach(({ term, definition }) => {
        html += `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(definition)}</dd>`;
      });
      html += `</dl>`;
    }

    if (deepDive) {
      html += `
        <div class="sm-deep-dive">
          <h4 class="sm-section-label" style="color:#60a5fa;">🔬 Deep Dive</h4>
          <p>${escapeHtml(deepDive)}</p>
        </div>`;
    }

    html += `</div>`;
    return html;
  }

  function renderFlashcards(cards) {
    const deck = document.getElementById("sm-flashcard-deck");
    const empty = document.getElementById("sm-flashcard-empty");
    if (!cards.length) { empty.style.display = "block"; return; }
    empty.style.display = "none";
    deck.innerHTML = cards.map((card, i) => `
      <div class="sm-flashcard" data-index="${i}" data-flipped="false">
        <div class="sm-flashcard-inner">
          <div class="sm-flashcard-front">
            <span class="sm-card-num">${i + 1}/${cards.length}</span>
            <p>${escapeHtml(card.question)}</p>
            <span class="sm-flip-hint">tap to reveal</span>
          </div>
          <div class="sm-flashcard-back"><p>${escapeHtml(card.answer)}</p></div>
        </div>
      </div>`).join("");
    deck.querySelectorAll(".sm-flashcard").forEach(card => {
      card.addEventListener("click", () => {
        const flipped = card.dataset.flipped === "true";
        card.dataset.flipped = String(!flipped);
        card.classList.toggle("sm-flipped", !flipped);
      });
    });
  }

  function appendChatMessage(role, content) {
    const container = document.getElementById("sm-chat-messages");
    const msg = document.createElement("div");
    msg.className = `sm-msg sm-msg-${role}`;
    msg.innerHTML = `<div class="sm-msg-bubble">${escapeHtml(content)}</div>`;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function showFlashcardBtn() {
    document.getElementById("sm-flashcard-actions").style.display = "block";
  }

  function setOutput(html) {
    const out = document.getElementById("sm-explanation-output");
    if (out) out.innerHTML = html;
  }

  function setStatus(text) {
    const el = document.getElementById("sm-status-text");
    if (el) el.textContent = text;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function escapeAttr(str) {
    return String(str || "")
      .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 3000);
  }

  function openPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      panel.classList.remove("sm-panel-minimized", "sm-panel-hidden");
      panel.classList.add("sm-panel-open");
      panelOpen = true;
    } else {
      injectPanel();
      setTimeout(() => openPanel(), 50);
    }
  }

  function closePanel() {
    document.getElementById(PANEL_ID)?.classList.add("sm-panel-hidden");
    panelOpen = false;
  }

  function minimizePanel() {
    document.getElementById(PANEL_ID)?.classList.toggle("sm-panel-minimized");
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "SM_TOGGLE_PANEL") {
      panelOpen ? closePanel() : openPanel();
      sendResponse({ ok: true });
    }
    if (msg.type === "SM_SELECTION_RESULT") {
      openPanel();
      document.querySelector("[data-tab='explain']")?.click();
      lastExplanation = msg.explanation ?? "";
      setOutput(renderExplanation(msg));
      showFlashcardBtn();
      setStatus("Done ✓");
    }
  });

  window.__SlideMentor = window.__SlideMentor || {};
  window.__SlideMentor.openPanel = openPanel;
  injectPanel();
  openPanel();
})();