# EduGuard v2

EduGuard is a private, role-based student-support workspace for a college department. It brings attendance, coursework and assessment marks together so a teaching team can spot a student who is slipping **early**, agree on a calm next step, and keep an audit trail of who changed what.

The application is plain HTML, CSS and JavaScript. The only npm dependency is `@libsql/client`; tests use the built-in `node:test` runner. There is no framework, bundler, TypeScript step, ORM, chart library or UI kit.

---

## What is included

### Two roles, enforced on the server

| Capability | HOD | Faculty |
| --- | --- | --- |
| See the whole department | Yes | No |
| Scope | All sections and subjects | Only assigned subject + section pairs |
| Dashboard, students, subjects, marks, attendance, heatmap, analytics, reports, assistant, account | Yes | Yes, scoped |
| Faculty accounts, structure, teaching assignments, data progress, audit log, terms, settings | Yes | No (`403`) |
| Create, edit and finalise assessments | Yes | Yes, within scope |
| Unlock a finalised assessment | Yes, with a reason | No |
| Change workspace scoring settings | Yes | No |
| Read settings needed for scoring | Yes | Yes |

Scope is checked on every API request, not only in the browser. A faculty account that guesses another subject or section receives `403 OUT_OF_SCOPE` and never receives that class's rows.

### Pages

Public: `/login`, `/403`, `/404` (also used for unknown URLs).

Workspace: `/dashboard`, `/students`, `/student?id=…`, `/marks`, `/attendance`, `/subjects`, `/heatmap`, `/analytics`, `/reports`, `/assistant`, `/account`.

HOD only: `/faculty`, `/structure`, `/assignments`, `/progress`, `/audit`, `/settings`, `/terms`.

Every page shares a responsive sidebar shell, a page header, light/dark themes, a command palette (`Ctrl/Cmd + K`), keyboard shortcuts, and print styles.

### Marks workspace

- Spreadsheet-style grid with one column per assessment, tab/arrow/enter navigation, and paste-a-column support.
- Debounced autosave. The save state says whether changes are dirty, saving, saved or invalid.
- Batch saves are atomic per assessment.
- Absent (`A`) and exempt (`E`) entries are distinct from a zero.
- Editing another person's mark, or a finalised assessment, asks for a reason and records it.
- CSV import supports `roll,score` (or `status`) with a dry-run preview, duplicate detection and unmatched-roll errors.
- Finalise/unlock with a reason; undo restores the most recent batch saved by the current user in the last 30 minutes.
- Every save, reason and undo is written to the audit log.

### Attendance

One register per subject, section and date. A saved register is the source for attendance percentages, weekly trends and drop warnings. The UI marks everyone present or absent in one action and saves the whole date.

### Analytics and reports

- Explainable support score: attendance × 35%, coursework completion × 25%, weighted marks × 40% by default.
- Two optional penalties: falling recent marks and a large four-week attendance drop.
- Bands: on track (≥70), watch closely (50–69), needs support (<50). A student with no usable data is shown as **no entries**, not as a zero.
- Class heatmap with a colour scale, band filters, section filter, search, sorting and CSV export.
- Subject health, score distributions, section comparisons, hardest assessments and class-average trends.
- Printable class and student reports with `@media print` rules.
- Data-progress view for the HOD: completeness per subject and section, overdue groups and CSV export.

### AI assistant

- Scoped chat (`/api/ai` type `voice`), weekly class actions, and anonymous student support plans.
- Student plans send only anonymous numbers: no name, roll number, section or subject labels leave the server.
- AI output is always a draft; the deterministic scoring engine decides the band.
- If no provider key is configured, or the provider fails, the client falls back to a local template.
- Rate limited to 20 requests per minute per user.
- Browser voice input and spoken replies are optional and degrade gracefully when speech APIs or microphone permission are unavailable.

### Security and operations

- Passwords hashed with `scrypt`; sessions are signed HMAC cookies (`eg_session`) with `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Replaceable session payloads: changing a password or deactivating an account ends existing sessions.
- CSRF protection: unsafe methods require a same-origin `Origin` and matching `Host`.
- JSON content-type enforcement, request size limits, validation errors with field messages, and rate limits on login and AI.
- Audit log for authentication, marks, attendance, assessments, assignments, users, terms and settings.
- Last-HOD protection: the final active HOD cannot be demoted or deactivated, and you cannot change your own role or deactivate yourself.
- Security headers (CSP, `X-Frame-Options`, `nosniff`, referrer policy, permissions policy) are set by both the dev server and `vercel.json`.
- No secrets are shipped under `public/`. Environment values are loaded only by server code.

---

## Folder structure

```text
eduguard3/
├── api/
│   └── [...path].js          # single Vercel catch-all -> lib/router.js
├── db/
│   ├── demo.js               # deterministic demo seed + reset/remove helpers
│   ├── migrate.js            # applies schema statements and default settings
│   ├── schema.js             # tables, indexes, triggers, default settings
│   └── seed.js               # CLI entry point for seeding
├── lib/
│   ├── ai.js                 # provider adapter, prompt payloads, offline behaviour
│   ├── analytics.js          # context loading, student/class analysis
│   ├── audit.js              # writeAudit helper
│   ├── auth.js               # scrypt, sessions, cookies, rate limits
│   ├── db.js                 # libSQL client, get/all/run/transaction
│   ├── env.js                # .env.local loader and required values
│   ├── permissions.js        # role scope, SQL filters, assertions
│   ├── router.js             # method/path matching, auth, CSRF, JSON limits
│   ├── scoring.js            # weights, schemes, bands, forecast, recovery paths
│   └── routes/
│       ├── actions.js        # mentor/action item endpoints
│       ├── ai.js
│       ├── analytics.js
│       ├── assessments.js
│       ├── assignments.js
│       ├── attendance.js
│       ├── audit.js
│       ├── auth.js
│       ├── demo.js
│       ├── marks.js
│       ├── reports.js
│       ├── settings.js
│       ├── students.js
│       ├── structure.js
│       ├── terms.js
│       └── users.js
├── public/
│   ├── *.html                # 21 pages
│   ├── favicon.svg
│   └── assets/
│       ├── css/              # tokens, base, layout, components, pages, print
│       ├── fonts/            # self-hosted Manrope + Source Sans 3 (woff2)
│       └── js/
│           ├── core/         # api, ui, shell, charts, csv, grid, app, voice
│           └── pages/        # one module per page
├── tests/
│   ├── permissions.test.js
│   └── scoring.test.js
├── .env.example
├── .gitignore
├── dev-server.js             # local Node server with the same router
├── package.json
├── package-lock.json
├── README.md
└── vercel.json
```

Generated or local-only paths (not part of the deliverable): `node_modules/`, `.env.local`, `.vercel/`, `.freebuff/`, `freebuff-sites-build/`.

---

## Getting started

### Requirements

- Node.js 20 or newer
- A Turso database (or another libSQL-compatible endpoint) for the hosted database

### 1. Install

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env.local` and fill in the values:

```dotenv
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-turso-token
SESSION_SECRET=<32+ random bytes as hex>
HOD_NAME=Dr. Priya Menon
HOD_EMAIL=hod@your-school.edu
HOD_PASSWORD=<a strong password, min 10 chars with a letter and a number>

# Optional AI provider
AI_API_KEY=
AI_PROVIDER=groq
AI_MODEL=openai/gpt-oss-120b
```

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`.env.local` is ignored by git. Never put any of these values in `public/`.

### 3. Migrate and seed

```bash
npm run migrate
npm run seed
```

- `npm run migrate` is idempotent and creates the tables, indexes and default settings.
- `npm run seed` creates the HOD from `HOD_EMAIL`/`HOD_PASSWORD` (if missing) and a deterministic demo department: 3 sections, 60 demo students, 5 faculty, 5 subjects, assessment types, schemes, assessments, marks and attendance.
- Demo faculty passwords are generated and printed **once** in the terminal. They are not stored anywhere else. Reset an individual password from **Faculty → Reset** if needed.
- To replace the demo students and records with a fresh deterministic set, run `npm run seed:reset`.

### 4. Run locally

```bash
npm run dev
```

The dev server defaults to <http://localhost:3000>. Set a different port with `PORT`:

```powershell
$env:PORT=3200; node dev-server.js
```

```bash
PORT=3200 node dev-server.js
```

### 5. Tests

```bash
npm test
```

Or, if `npm` is restricted by a PowerShell execution policy:

```bash
node --test tests/*.test.js
```

The suites cover the scoring engine (weights, schemes, bands, penalties, forecast) and authorization scoping (faculty pairs, HOD access, SQL filters, payload shape).

---

## Main API surface

All responses use a consistent envelope:

```json
{ "ok": true, "data": {} }
```

```json
{ "ok": false, "error": { "code": "OUT_OF_SCOPE", "message": "…", "fields": {} } }
```

| Area | Endpoints |
| --- | --- |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password` |
| Students | `GET/POST /api/students`, `GET/PATCH /api/students/:id`, `POST /api/students/import` |
| Structure | `GET/POST/PATCH /api/sections`, `/api/subjects`, `/api/assessment-types` |
| Schemes | `GET/PUT /api/schemes/:subjectId` |
| Assignments | `GET/PUT /api/assignments` |
| Terms | `GET/POST /api/terms`, `POST /api/terms/:id/activate`, `POST /api/terms/:id/rollover` |
| Assessments | `GET/POST /api/assessments`, `PATCH/DELETE /api/assessments/:id`, `POST /api/assessments/:id/lock`, `POST /api/assessments/:id/unlock` |
| Marks | `GET/PUT /api/assessments/:id/marks`, `POST /api/assessments/:id/marks/import`, `POST /api/assessments/:id/marks/undo` |
| Attendance | `GET/PUT /api/attendance` |
| Analytics | `GET /api/analytics/dashboard`, `/api/analytics/heatmap`, `/api/analytics/subjects`, `/api/analytics/subject/:id`, `/api/analytics/fairness`, `/api/analytics/progress` |
| Reports | `GET /api/reports/class`, `GET /api/reports/student/:id`, `GET /api/export/at-risk.csv` |
| Actions | `GET/PUT /api/students/:id/actions`, `GET/PUT /api/students/:id/mentors` |
| Users | `GET/POST /api/users`, `PATCH /api/users/:id`, `POST /api/users/:id/reset-password` |
| Settings | `GET/PUT /api/settings` |
| Audit | `GET /api/audit`, `GET /api/audit.csv` |
| AI | `POST /api/ai` (`type: student \| weekly \| voice`) |
| Demo | `POST /api/demo/reset`, `DELETE /api/demo` (HOD only) |

---

## How the support score works

Each signal is clamped to 0–100 and multiplied by its weight:

```text
score = attendance × wA + coursework × wC + weighted marks × wM
```

Defaults: `wA = 35`, `wC = 25`, `wM = 40`.

- **Attendance** is present records ÷ held records across the term.
- **Coursework** is completed coursework-type assessments ÷ expected, with exempt entries excluded.
- **Weighted marks** use each subject's scheme (average, best N, or sum), re-normalising weights when a type has no data. Without a usable scheme the plain average of recorded percentages is used.
- **Penalties** (five points each): a falling recent mark trend (when at least the configured minimum number of assessments exist) and an attendance drop of at least the configured amount over four weeks.
- **Bands** use `onTrack` and `watch` thresholds (default 70 and 50).
- A student with no usable signal returns `hasData: false` and is shown as “no entries”, never as a zero.

HODs can change weights, thresholds, absent-as-zero behaviour and the trend minimum on **Settings**. Changes are workspace-wide and audited. Existing analyses are recalculated on the next request; no stored score is rewritten.

---

## Deployment

1. Create a Turso database and token.
2. Push the repository to GitHub and import it into Vercel.
3. Add the environment variables from `.env.local` in **Vercel → Project → Settings → Environment Variables**.
4. Deploy. `vercel.json` routes `/` to `/login.html`, keeps clean URLs, gives the API function a 30-second limit and 1 GB of memory, applies security headers, and caches static assets for one hour.
5. Run the migration and seed against the production database once:

```bash
npm run migrate
npm run seed
```

The first HOD is created from `HOD_NAME`, `HOD_EMAIL` and `HOD_PASSWORD`. Change the password after the first sign-in.

---

## Design notes

- **Palette:** deep indigo and teal on warm neutrals; semantic green/amber/red for bands and status.
- **Type:** self-hosted Manrope (headings) and Source Sans 3 (body), so there is no third-party font request.
- **Layout:** sticky sidebar on desktop, slide-over navigation below 1024 px, single-column cards below 720 px. Tables scroll horizontally rather than breaking the layout.
- **Components:** buttons, fields, cards, tables, KPI tiles, meters, chips, tabs, modals, toasts, command palette, skeleton loaders and empty/error states are all hand-written.
- **Charts:** SVG line, bar and donut primitives in `charts.js`, with accessible labels and no chart dependency.
- **Printing:** `print.css` hides navigation and controls, expands tables, and keeps report pages legible in black and white.
- **Motion:** short transitions only, disabled by `prefers-reduced-motion`.
- **Contrast:** light and dark themes are checked for readable text on every surface.

---

## Assumptions

- A department has one active academic term at a time. Terms are created, activated and rolled over by the HOD.
- A student belongs to exactly one section. A subject can be taught to several sections.
- A teaching assignment is a subject + section pair. Faculty scope follows these pairs.
- Sections and subjects are archived/deactivated rather than hard-deleted when they hold historical records.
- The demo department is intentionally small (60 students, 5 subjects) so the UI stays fast and understandable.
- AI is optional. The app is fully usable with no AI key, using local templates.
- The browser must allow first-party cookies for sessions. Speech input needs a supporting browser and microphone permission; typing always works.

## Limitations

- Email delivery is not included. Temporary passwords are displayed once to the HOD, who shares them privately.
- Password reset is HOD-driven; there is no self-service “forgot password” email flow.
- The seed data is synthetic and is not a statistically realistic cohort.
- AI output depends on the configured provider and can be wrong; it is labelled as a draft and is never used to compute the deterministic band.
- File import is CSV only. There is no XLSX parser.
- The audit log stores JSON snapshots for changes; there is no separate immutable event store or external SIEM export.
- Real-time collaboration is not supported. Two people editing the same assessment may overwrite each other's marks; the audit log records both writes.
- There is no mobile native app. The responsive web UI is the supported mobile experience.

---

## Troubleshooting

**`npm` cannot run because scripts are disabled (Windows PowerShell)**

Use Node directly:

```powershell
node --test tests/*.test.js
node dev-server.js
```

Or change the execution policy for the current user:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**Port already in use**

Set `PORT` before starting the server, or stop the process using the port:

```powershell
$env:PORT=3200; node dev-server.js
```

**Login says the database is not configured**

Check that `.env.local` exists at the repository root and contains `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Run `npm run migrate` once.

**AI says the offline template is being used**

No `AI_API_KEY` is configured, the provider rejected the request, or the per-minute limit was reached. The rest of the app keeps working.

---

## License

MIT. See `package.json`.
