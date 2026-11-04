# EduGuard

EduGuard is a small, dependency-free teacher dashboard for spotting students who may need support and planning the next conversation. It is deliberately a decision-support prototype: the indicators do not label students or replace professional judgment.

## What is included

- **Dashboard** — summary cards, support distribution, section comparison, common reasons, search, filters, sorting and CSV export.
- **Today's focus** — a collapsed-by-default list of the five students who deserve the first check-in.
- **Class heatmap** — a separate responsive page at `/heatmap.html` with attendance, assignments, subject marks and recent trend.
- **Student record** — transparent score breakdown, forecast, supporting factors, action checklist, notes, recovery scenarios and a what-if simulator.
- **AI support draft** — optional teacher plan and parent message. Only performance numbers are sent to `/api/ai`; names and roll numbers stay in the browser.
- **Live AI call** — use **Talk to EduGuard** for a call-style browser voice conversation. It rings, introduces itself, listens hands-free, speaks replies, and supports conservative barge-in: only meaningful, confident speech can interrupt a reply, while microphone noise suppression and signal checks filter background noise. A text input remains available when browser speech recognition is unavailable.
- **Offline fallback** — the dashboard remains useful without an API key or network access.
- **CSV import/export** — import a class using the sample format shown below and export the current at-risk list.

## Run locally

Use Node.js 18 or later:

```bash
node server.js
```

Open <http://localhost:3000>. Open `index.html` directly for the local, non-AI preview; the AI request needs the local server or a deployment that includes `/api/ai`.

## Optional AI configuration

The browser never contains an API key. The endpoint reads these environment variables:

```text
AI_API_KEY=your-key
AI_PROVIDER=groq
AI_MODEL=openai/gpt-oss-120b
```

`.env` and `.env.local` are ignored by Git. Restart `node server.js` after changing either file. If no key is configured, the interface uses its local template plan.

For the live voice feature, keep `AI_PROVIDER=groq`. The browser does not receive the Groq key. Voice requests use the existing `POST /api/ai` endpoint with `type: "voice"` and a short, sanitised conversation history.

## CSV format

Required columns are `name`, `roll`, `section`, `attendance` and `assignments`. Add a single `marks` column, three test columns (`t1`, `t2`, `t3`), or subject columns such as `maths`, `physics`, `chemistry`, `english` and `computer_science`. Optional `attendance_w1` through `attendance_w4` columns provide a real four-week attendance trend.

Values must be between 0 and 100. The browser validates the file before replacing the current view, and supports up to 300 rows.

## Scoring model

The current score is intentionally explainable:

```text
35% attendance + 25% assignments + 40% weighted marks
```

Tests are weighted T1 20%, T2 30% and T3 50%. A five-point adjustment is applied when marks fall at every test, and another five-point adjustment is applied when attendance falls by at least ten points over four weeks. Scores below 50 are in **Needs support**, 50–69 are **Watch closely**, and 70 or above are **On track**.

The next-test forecast is a directional estimate calibrated with demo patterns. It is shown separately from the current score and should never be presented as a certainty.

## Project structure

```text
index.html                 Dashboard page
heatmap.html               Dedicated heatmap page
assets/css/app.css         Shared responsive styles
assets/js/data.js          Demo data and CSV parsing
assets/js/scoring.js       Score, factors, forecast and recovery logic
assets/js/app.js           Shared state, drawer, actions and AI UI
assets/js/dashboard.js     Dashboard rendering and interactions
assets/js/heatmap.js       Heatmap rendering and interactions
api/ai.js                  Serverless AI endpoint
server.js                  Zero-dependency local server
```

For real student data, add authentication, access control, a database, retention rules and a reviewed model trained on appropriately governed historical outcomes before using this beyond a prototype.
