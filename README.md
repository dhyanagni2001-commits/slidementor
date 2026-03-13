# ✦ SlideMentor

> AI-powered Chrome Extension that explains your lecture slides — automatically.

Open any Brightspace PDF, click the extension, and get instant deep explanations, chat, and flashcards — all in a side panel while you study.

---

## What It Does

- **Auto-loads** your PDF from Brightspace — no manual upload needed
- **Explains every slide** with summary, key points, terms, and deep dive
- **Detects slide type** — text, math (α β γ ∑), diagram, or image-only
- **Chat tab** — ask follow-up questions about any slide
- **Flashcards** — generates Q&A cards for exam prep
- **RAG pipeline** — searches the whole PDF for context before answering
- **Response cache** — same slide is never re-fetched from the API twice

---

## Demo

```
Open Brightspace PDF → Click Extension Icon → Panel opens → Click any page → Get explanation
```

---

## Architecture

```
Chrome Extension (injector.js)
        ↓
FastAPI Backend (HuggingFace Spaces)
        ↓
Groq API — LLaMA 3.3 70B (free tier)
        ↓ (local only)
Ollama — LLaVA vision (diagram slides)
```

---

## Project Structure

```
clean_slidementor/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── requirements.txt
│   ├── Dockerfile               # HuggingFace deployment
│   ├── routers/
│   │   ├── pdf.py               # PDF extract, fetch, explain
│   │   ├── explain.py           # Slide explain + flashcards
│   │   └── chat.py              # Chat endpoint
│   ├── services/
│   │   ├── groq_client.py       # Groq API wrapper
│   │   ├── ollama_client.py     # Ollama vision wrapper
│   │   └── rag.py               # TF-IDF RAG + cache + metrics
│   ├── prompts/
│   │   └── system.py            # All LLM prompts
│   └── middleware/
│       └── sanitizer.py         # Input sanitization
└── extension/
    ├── manifest.json
    └── src/
        ├── content/
        │   ├── injector.js      # Panel UI + all user interactions
        │   ├── detector.js      # Platform detection
        │   ├── extractor.js     # DOM text extraction
        │   └── highlighter.js  # Text selection tooltip
        ├── background/
        │   └── worker.js        # Service worker + API proxy
        ├── popup/
        │   ├── popup.html
        │   └── popup.js
        └── ui/
            └── panel.css        # Dark academic theme
```

---

## Local Setup

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

export GROQ_API_KEY=your_key_here
venv/bin/python -m uvicorn main:app --port 8000
```

Get a free Groq API key at [console.groq.com](https://console.groq.com)

### 2. Extension

1. Go to `chrome://extensions/`
2. Enable **Developer Mode**
3. Click **Load unpacked**
4. Select the `extension/` folder

Make sure `BACKEND_URL` in `injector.js` and `worker.js` points to `http://localhost:8000`

### 3. Ollama (optional — for diagram/image slides)

```bash
ollama serve
ollama pull llava
```

---

## Deployment (HuggingFace Spaces)

1. Create a new Space at [huggingface.co/spaces](https://huggingface.co/spaces)
2. Set SDK to **Docker**
3. Clone the Space repo and copy all `backend/` files into it
4. Add `GROQ_API_KEY` as a **Secret** in Space Settings
5. Push — builds automatically in ~3 minutes

Then update `BACKEND_URL` in both `injector.js` and `worker.js`:

```javascript
const BACKEND_URL = "https://YOUR_HF_USERNAME-slidementor.hf.space";
```

Test: `https://YOUR_HF_USERNAME-slidementor.hf.space/health` → `{"status":"ok"}`

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/extract-pdf` | Upload PDF, extract text, build RAG index |
| POST | `/fetch-pdf-url` | Fetch PDF from URL with cookies |
| POST | `/explain-pdf-page` | Explain a page (RAG + cache + vision) |
| POST | `/explain-slide` | Explain slide text or image |
| POST | `/chat` | Chat with slide context |
| GET | `/metrics` | Latency, tokens, cache hit rate |
| GET | `/health` | Health check |

---

## Slide Type Detection

| Type | Detection | Handling |
|------|-----------|----------|
| Text | >40 chars of text | Sent to Groq directly |
| Math | Greek letters / math fonts | Tagged as `[MATH: ...]`, every symbol explained |
| Mixed | Text + >8 large vector drawings | Text + screenshot → Ollama + Groq |
| Image only | <40 chars + raster image | Screenshot → Ollama → Groq |

---

## Tech Stack

- **FastAPI** — Python backend
- **PyMuPDF** — PDF extraction with math symbol detection
- **Groq** — LLaMA 3.3 70B, free tier (14,400 req/day)
- **TF-IDF** — pure Python RAG, no external vector DB
- **SHA-256 LRU Cache** — response caching
- **Chrome MV3** — extension with service worker
- **HuggingFace Spaces** — free Docker hosting

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | From [console.groq.com](https://console.groq.com) |

---

## Known Limitations

- Ollama vision only works locally — gracefully skipped on HuggingFace
- Screenshot capture may fail on Brightspace iframes (Chrome security)
- Groq free tier: 6,000 tokens/min, 14,400 requests/day

---



