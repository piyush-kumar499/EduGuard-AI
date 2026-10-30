# Student Performance Early-Warning Dashboard

A single-page, offline-friendly early-warning dashboard for teachers. The existing layout, styling, rule score and CSV workflow are unchanged. This update adds five features:

1. **Today's priority list** — the five students to help first, using current need, next-test forecast and pending urgent actions.
2. **Risk forecast** — a small in-browser logistic regression trained on synthetic past students, shown separately from the rule score (`rule score = now`, `forecast = next test`).
3. **AI support plan** — a 3–4 step teacher plan plus an English/Hindi parent message.
4. **AI weekly summary** — five class-level action lines based on counts and common reasons.
5. **Class heatmap** — a colour-and-number grid of attendance, assignments, subjects and trend.

The dashboard always works without an AI key: every AI feature has a local template fallback with an **Offline mode** tag.

---

## Files

- `index.html` — the dashboard. All new front-end features live here.
- `api/ai.js` — serverless endpoint for the AI support plan and weekly summary (works on Vercel and in the local server).
- `server.js` — zero-dependency local server; serves the dashboard and `/api/ai` without deploying.
- `.env.local` — your local keys (ignored by git; empty until you paste one in).
- `README.md` — this file.

---

## How the AI endpoint stays safe

The browser **never** contains an API key. It sends only anonymous data to `/api/ai`:

- Student plan: roll number, section, attendance, four-week attendance trend, assignments, average marks, T1–T3, latest test, rule score, forecast, and whether an urgent action is pending. **No names are sent.**
- Weekly summary: class-level counts and the most common reason labels. **No names are sent.**

`api/ai.js` reads the key from `process.env.AI_API_KEY` (or `GROQ_API_KEY` / `XAI_API_KEY`) and the model from `process.env.AI_MODEL` on the server.

By default it calls the **Anthropic Messages API**. Set `AI_PROVIDER=groq` to call **Groq** (`https://api.groq.com/openai/v1/chat/completions`); the default Groq model is `openai/gpt-oss-120b`, which replaced `llama-3.3-70b-versatile` when Groq retired it on 16 Aug 2026. Retired model IDs are detected and retried with the replacement automatically. It also supports **xAI / Grok** when `AI_PROVIDER=grok` or when `AI_MODEL` starts with `grok`.

Every AI result is labelled **“AI suggestion, teacher decides.”**

---

## Set `AI_API_KEY` and `AI_MODEL` on Vercel

1. Push this project to a Git repository and import it into Vercel, or run `vercel` from the project root.
2. In the Vercel dashboard, open the project → **Settings** → **Environment Variables**.
3. Add:
   - **Name:** `AI_API_KEY`
   - **Value:** your Anthropic API key (or xAI/Grok key if you use Grok)
   - **Environments:** Production, Preview, Development
4. Add:
   - **Name:** `AI_MODEL`
   - **Value:** `claude-sonnet-5-5` (the default), or the exact model ID you want to use.
5. Optional, only for Grok / xAI:
   - **Name:** `AI_PROVIDER`
   - **Value:** `grok`
   - Set `AI_MODEL` to the Grok model ID available to your xAI account (for example, a `grok-*` model).
6. Click **Save**, then **Redeploy** the project so the new environment variables are available to the function.

You can also use the Vercel CLI:

```bash
vercel env add AI_API_KEY
vercel env add AI_MODEL
# optional for xAI / Grok
vercel env add AI_PROVIDER
vercel --prod
```

Do not put the key in `index.html`, a `.env` file committed to Git, or any client-side JavaScript.

---

## Local testing

Because `/api/ai` is a serverless function, open the dashboard through a local server or deploy it to Vercel to exercise the live AI path.

### Run locally with Groq (no deployment)

1. Get a key from <https://console.groq.com/keys>.
2. Open `.env.local` in this folder and paste it after `AI_API_KEY=`. Leave `AI_PROVIDER=groq` and `AI_MODEL=openai/gpt-oss-120b` as they are.
3. Start the local server:

   ```bash
   node server.js
   ```

4. Open <http://localhost:3000>. The console prints whether the key was loaded.

The server reads `.env` and `.env.local` on startup, so restart it after editing the key. You can also use `vercel dev` instead if the Vercel CLI is installed; both serve the same `api/ai.js`.

If you open `index.html` directly as a file, or serve it without the `api` folder, the dashboard detects that the AI endpoint is unavailable and uses the offline template automatically.

---

## Response contract

`POST /api/ai` accepts either:

```json
{ "type": "student", "student": { "...anonymous numbers only..." } }
```

or:

```json
{ "type": "weekly", "class": { "...class-level counts and reasons..." } }
```

It returns:

```json
{ "ok": true, "result": { "...strict JSON from the model..." } }
```

On a missing key, provider error, invalid model output or timeout, it returns a non-2xx response. The front end then shows the offline template with the **Offline mode** tag.

---

## Notes

- The rule score and forecast are deliberately separate. The forecast does not change the rule score, the risk badges, the CSV import or the printed report.
- Forecast accuracy is shown in the **How it works** modal as holdout accuracy, labelled **trained on synthetic data**.
- The heatmap and priority list respect the section filter. The heatmap scrolls horizontally on small screens and every cell contains its number, so colour is not the only signal.
- The original footer note remains: indicators support educators; they do not label students.
