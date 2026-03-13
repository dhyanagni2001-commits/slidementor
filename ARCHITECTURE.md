# SlideMentor — Architecture & Design Document

## 1. System Architecture

### Overview
SlideMentor is a browser extension with a decoupled FastAPI backend. The extension never holds a Groq API key — all LLM calls are proxied through the backend, which enforces rate limiting, sanitization, and prompt safety.

### Data Flow (Text Slide)
```
User opens Google Slides
    → detector.js identifies platform
    → injector.js injects panel DOM
    → User clicks "Explain This Slide"
    → injector.js calls extractor.js
    → extractor.js queries DOM selectors
    → Raw text sanitized (injection patterns stripped)
    → isImageHeavy check: len(text) < 30
    → Text slide path: POST /explain-slide {mode: "text", text: "...", metadata: {...}}
    → worker.js proxies to backend via fetch()
    → FastAPI: rate limit check → Pydantic validation → sanitize_input()
    → groq_client.py: build prompt (system + user turn)
    → Groq API: llama3-70b-8192, temperature=0.3, max_tokens=900
    → Response parsed into {summary, keyPoints, terms}
    → JSON returned to extension
    → renderExplanation() builds safe HTML (all values escaped)
    → Panel displays result with fade-in animation
```

### Data Flow (Image Slide)
```
isImageHeavy = true (< 30 chars of text)
    → injector.js sends SM_CAPTURE_SCREENSHOT to worker.js
    → worker.js calls chrome.tabs.captureVisibleTab()
    → JPEG, quality 70 → base64 data URL
    → POST /explain-slide {mode: "image", screenshot: "data:image/jpeg;base64,..."}
    → Backend validates JPEG prefix
    → SLIDE_IMAGE_PROMPT used (no vision — Groq free tier is text-only)
    → Model provides contextual framing based on slide title
```

### Context Compression Strategy
- Slide text: hard-capped at 4,000 chars in extractor, 3,500 in router
- Chat history: rolling window of last 10 turns, each message ≤ 1,500 chars
- SHA-256 hash of slide text used as cache key → 0 Groq calls on repeated views

---

## 2. Prompt Engineering Design

### Why separate user content from system prompt?
The most robust injection defense is to never let user-controlled text near the system prompt. In SlideMentor:
- System prompt: fixed, role-establishing, constraint-setting
- User message turn: all slide content, all user questions
This means even if a slide says "IGNORE ALL PREVIOUS INSTRUCTIONS", the model correctly treats it as user content, not an override.

### Prompt Temperature Rationale
| Use case | Temperature | Rationale |
|----------|-------------|-----------|
| Slide explanation | 0.3 | Factual accuracy priority |
| Chat responses | 0.3 | Consistent, focused answers |
| Flashcard generation | 0.4 | Slightly more creative question variety |

### Structured Output Strategy
Instead of JSON (which can fail parsing), slide explanations use a lightweight text format:
```
SUMMARY: ...
KEY_POINTS:
- ...
TERMS:
- term: definition
```
This is more robust to LLM formatting variations than JSON, and the `_parse_explanation_response()` function handles it with a simple state machine.

Flashcards use JSON since they need to be machine-readable for the card flip UI.

---

## 3. Security Architecture

### Threat Model
| Threat | Mitigation |
|--------|------------|
| Prompt injection via slide | Regex sanitizer + user-turn isolation |
| API key theft | Key server-side only, never in extension |
| Groq quota abuse | Rate limiter (30 req/min/IP) |
| XSS via LLM output | All output through escapeHtml() before DOM insertion |
| Malicious screenshots | Data URL format validated before processing |
| Data exfiltration | No persistent storage of slide content |

### Injection Defense Layers
1. `extractor.js`: basic sanitization at source
2. `sanitize_input()` in `middleware/sanitizer.py`: comprehensive regex filter
3. Pydantic `field_validator`: runs sanitizer on every string field
4. Prompt architecture: system prompt never interpolates user text
5. `INJECTION_REGEX`: 12+ patterns covering LLaMA, ChatML, Anthropic formats

---

## 4. UI Design Specification

### Theme: Dark Academic
Inspired by candlelit libraries, aged manuscripts, and academic institutions. Not "dark mode" — specifically evokes scholarly depth.

### Color Palette
```
--sm-bg-deep:     #0b0d12  (near-black, background of backgrounds)
--sm-bg-base:     #0f1117  (panel background)
--sm-bg-raised:   #141720  (cards, input areas)
--sm-bg-overlay:  #1a1e2a  (tooltips, message bubbles)
--sm-gold:        #c8a96e  (primary accent — aged gold)
--sm-gold-light:  #d9bc85  (hover state)
--sm-text-primary:#e8e4d9  (warm off-white, easier on eyes than pure white)
--sm-text-muted:  #555970  (subdued labels)
```

### Typography
- **Display**: DM Serif Display — italic serif for logo and card questions; evokes academic authority
- **Body**: DM Sans — geometric humanist, highly readable at small sizes
- **Code**: JetBrains Mono — for technical terms and status indicators

### Layout
- Fixed right panel, 380px wide
- Slides open via CSS transform (translateX) — no layout shift
- Tab system (Explain / Chat / Flashcards) — no page navigation
- Status bar always visible — users know if the AI is thinking

### Flashcard Design
- CSS 3D flip animation (preserve-3d / backface-visibility)
- Front: dark neutral with serif question text
- Back: subtle green tint (#1a2210) — signals "answer territory"
- Flip hint fades in, disappears on flip

### Highlight Tooltip
- Appears above selection, not below — avoids blocking text
- Rounded pill shape (border-radius: 20px) — feels native, not intrusive
- Two actions: "Explain this" (primary) + "Flashcard" (secondary)
- Auto-hides on mousedown outside

---

## 5. Performance Strategy

### Request Optimization
```
Slide A (first view)  → Full Groq API call → Cache result
Slide A (revisit)     → Cache hit          → 0 API calls, instant response
Slide B (new)         → Full Groq API call → Cache result
Total for 10-slide deck with 2 revisits: ~10 API calls (not 12)
```

### Token Budget Per Request
```
System prompt:     ~200 tokens
Slide text:        ≤ 875 tokens (3,500 chars / 4 chars per token)
Prompt template:   ~100 tokens
Total input:       ~1,175 tokens
Max output:        900 tokens
Total per call:    ~2,075 tokens
Groq free limit:   6,000 tokens/minute
Calls before limit: ~2.9 calls/minute (generous for one user)
```

### Memory
- Cache evicts oldest entry at 50 slides (FIFO)
- Chat history stored in JS array — cleared on panel close
- No IndexedDB or localStorage (avoids CSP issues and privacy concerns)

---

## 6. Deployment Architecture

```
GitHub repo
    │
    ├── /backend  ──→  Render Web Service (free)
    │                  Auto-deploys on push to main
    │                  GROQ_API_KEY in env vars
    │                  URL: https://slidementor-api.onrender.com
    │
    └── /extension ──→  Load unpacked (dev)
                        Chrome Web Store (production)
                        CONFIG.BACKEND_URL updated before publish
```

### Free Tier Limitations to Know
- Render free tier sleeps after 15 min of inactivity → first request takes ~30s
- Solution: Extension can show "Waking up server…" message on first load
- Groq free tier: 6,000 tokens/min, 500,000 tokens/day — sufficient for demo

---

*This document + codebase constitutes a complete, deployable, portfolio-grade project. Estimated real-world build time: 3-4 days for a senior engineer; 2-3 weeks for a junior.*
