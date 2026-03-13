# ✦ SlideMentor

> AI-powered slide explainer, flashcard generator, and contextual tutor — built as a Chrome extension backed by Groq's ultra-fast LLaMA 3 inference.

---

## Problem Statement

Students and professionals regularly sit through dense slide decks without adequate explanation. Existing tools require copying text, switching apps, and manually prompting AI. SlideMentor brings the AI **into the slide itself** — detecting what's on screen, explaining it in context, and enabling interactive study without ever leaving the presentation.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   BROWSER EXTENSION                      │
│                                                          │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │ Content      │    │ Background   │                    │
│  │ Scripts      │◄──►│ Service      │                    │
│  │              │    │ Worker       │                    │
│  │ - detector   │    │              │                    │
│  │ - extractor  │    │ - API proxy  │                    │
│  │ - highlighter│    │ - screenshot │                    │
│  │ - injector   │    │ - msg router │                    │
│  └──────┬───────┘    └──────┬───────┘                   │
│         │                   │                            │
│         ▼                   ▼                            │
│  ┌──────────────────────────────────┐                   │
│  │        Side Panel UI             │                    │
│  │  Explain │ Chat │ Flashcards     │                    │
│  └──────────────────────────────────┘                   │
└───────────────────────┬─────────────────────────────────┘
                        │  HTTPS POST
                        ▼
┌─────────────────────────────────────────────────────────┐
│              FASTAPI BACKEND (Render free)               │
│                                                          │
│  POST /explain-slide                                     │
│  POST /explain-selection                                 │
│  POST /chat                                              │
│                                                          │
│  Middleware: CORS │ Rate Limit │ Sanitizer               │
└───────────────────────┬─────────────────────────────────┘
                        │  Groq SDK
                        ▼
┌─────────────────────────────────────────────────────────┐
│               GROQ FREE TIER                             │
│         Model: llama3-70b-8192                           │
│         Temperature: 0.3                                 │
│         Max tokens: 900 per call                         │
└─────────────────────────────────────────────────────────┘
```

### Decision Logic: Text vs Image

```
Slide detected
     │
     ▼
Extract DOM text
     │
     ├── text.length > 30? ──► TEXT MODE
     │                         Send text to /explain-slide
     │
     └── text.length ≤ 30? ──► IMAGE MODE
                               Capture screenshot (JPEG, 70% quality)
                               Send to /explain-slide with mode=image
```

### Context Handling Strategy

- **Slide text**: Truncated to 3,500 chars upstream; SHA-256 cached to avoid re-calls
- **Chat history**: Last 10 turns sent; each message capped at 1,500 chars
- **Selection context**: Last 1,000 chars of surrounding slide text included
- **Total context budget**: ~4,500 tokens per call (well within 8,192 context window)

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Extension | Chrome MV3, Vanilla JS | No build step, max compatibility |
| Styling | Custom CSS, DM Serif / DM Sans | Dark academic aesthetic |
| Backend | FastAPI + Python 3.11 | Fast, async, excellent OpenAPI support |
| LLM | Groq + LLaMA 3 70B | Free tier, ~300 tok/s, open model |
| Hosting | Render free tier | Zero cost, auto-deploy from GitHub |
| Validation | Pydantic v2 | Model-level sanitization |

---

## Why Groq?

Groq's free tier offers:
- **~300 tokens/second** inference on LLaMA 3 70B — faster than any paid OpenAI tier
- Generous rate limits for demo-scale usage (6,000 tokens/minute on free)
- The `groq` Python SDK is a near-drop-in replacement for the OpenAI SDK
- `llama3-70b-8192` is state-of-the-art for instruction following and educational content

---

## Folder Structure

```
slidementor/
├── extension/
│   ├── manifest.json          # MV3 manifest
│   ├── icons/
│   └── src/
│       ├── background/
│       │   └── worker.js      # Service worker — API proxy, screenshot
│       ├── content/
│       │   ├── detector.js    # Platform detection
│       │   ├── extractor.js   # DOM text extraction + sanitization
│       │   ├── highlighter.js # Selection tooltip
│       │   └── injector.js    # Panel DOM injection + all UI logic
│       ├── popup/
│       │   ├── popup.html
│       │   └── popup.js
│       └── ui/
│           └── panel.css      # Dark academic theme
└── backend/
    ├── main.py                # FastAPI app, CORS, middleware
    ├── requirements.txt
    ├── render.yaml            # One-click Render deploy
    ├── routers/
    │   ├── explain.py         # /explain-slide, /explain-selection
    │   └── chat.py            # /chat
    ├── services/
    │   └── groq_client.py     # Groq SDK wrapper + JSON parser
    ├── prompts/
    │   └── system.py          # All prompt templates
    └── middleware/
        ├── rate_limiter.py    # Sliding window rate limiter
        └── sanitizer.py      # Injection defense + input cleaning
```

---

## Edge Case Handling

| Scenario | Handling |
|----------|----------|
| **No-text slide** | `isImageHeavy=true` → screenshot path, contextual framing prompt |
| **Very long slide** | Truncated to 3,500 chars before API call; prompt instructs summarization |
| **Very short highlight** | Min 5 chars enforced; if too short, model instructed to give context |
| **Malicious slide content** | Regex injection filter on extraction; never embedded in system prompt |
| **Groq rate limit** | `GroqRateLimitError` → 429 response → extension shows retry message |
| **Diagram with no labels** | `image` mode prompt asks model to explain what to look for generically |
| **Non-educational request** | `is_off_topic()` check → appended redirect note in system prompt |
| **Request timeout** | 25s `AbortController` in extension → user-facing timeout message |

---

## Security Considerations

1. **Prompt injection defense**: All user text is sanitized via regex and never interpolated into the system prompt — only the user turn
2. **Input length caps**: Enforced at Pydantic model level and in extractor
3. **CORS restriction**: Only Google Slides/Drive origins and `chrome-extension://` allowed
4. **Rate limiting**: 30 req/min per IP; prevents abuse of Groq quota
5. **No API key in extension**: All LLM calls proxied through backend; key stays server-side
6. **Screenshot validation**: Data URLs validated for JPEG format before processing
7. **HTML escaping**: All LLM output escaped before DOM injection

---

## Performance Strategy

- **Slide hash cache**: Identical slide text never re-calls Groq (SHA-256 key, LRU eviction at 50 entries)
- **Token budgeting**: max_tokens=900 keeps cost predictable and responses fast
- **JPEG 70% quality**: Reduces screenshot payload by ~60% vs PNG
- **History window**: Only last 10 chat turns sent, capped at 1,500 chars each
- **Lazy injection**: Panel DOM created once, shown/hidden via CSS — no re-injection

---

## Limitations

- Image-heavy slides currently use a contextual framing prompt, not true vision (Groq free tier is text-only)
- In-memory rate limiter resets on server restart (fine for demo, use Redis for production)
- Google Slides DOM selectors may need updates if Google changes their markup
- PDF support depends on Drive's text layer being rendered

---

## Future Improvements

- [ ] Add vision model (when Groq adds free tier vision support)
- [ ] Redis-based rate limiting for multi-instance deployment
- [ ] User accounts + study history via Supabase free tier
- [ ] Export flashcards to Anki format
- [ ] Speaker notes extraction
- [ ] Multi-slide summarization ("Explain this whole deck")
- [ ] Firefox extension port

---

## How to Run Locally

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

export GROQ_API_KEY=your_key_here
uvicorn main:app --reload --port 8000
```

API available at `http://localhost:8000` · Docs at `http://localhost:8000/docs`

### Extension

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `extension/` folder
4. Update `CONFIG.BACKEND_URL` in `extension/src/background/worker.js` to `http://localhost:8000`
5. Navigate to any Google Slides presentation

---

## Deploy to Render (Free)

1. Push repo to GitHub
2. Create new **Web Service** on [render.com](https://render.com)
3. Connect your GitHub repo → set **Root Directory** to `backend/`
4. Build command: `pip install -r requirements.txt`
5. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Add environment variable: `GROQ_API_KEY = your_key`
7. Deploy → copy the `https://your-app.onrender.com` URL
8. Update `CONFIG.BACKEND_URL` in `worker.js`

---

## Chrome Web Store Publishing

1. Zip the `extension/` folder: `zip -r slidementor-extension.zip extension/`
2. Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
3. Pay one-time $5 developer fee
4. Upload zip, fill metadata, submit for review (~3-7 days)

---

*Built for a Master's-level portfolio. Architecture prioritizes clean separation of concerns, defense-in-depth security, and zero-cost infrastructure.*
