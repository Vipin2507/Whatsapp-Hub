# Buildesk CRM Platform

Full-stack contact management and WhatsApp messaging platform composed of a Flask API, React/TypeScript dashboard, and supporting services for AI/n8n automation and WAHA WhatsApp transport.

## Repository Layout
- `backend/` – Flask API, SQLite persistence, background scheduler, and integrations with WAHA and n8n.
- `frontend/` – Vite + React + TypeScript single-page app with Shadcn/Radix UI and React Query data layer.
- `docker-compose.yml` – Orchestration for backend, frontend (Nginx), WAHA, and n8n.
- `DASHBOARD_IMPROVEMENTS.md` – Product/design notes.

## Tech Stack
- Backend: Python 3.10, Flask, Flask-Login, SQLAlchemy (SQLite), APScheduler, Gunicorn.
- Frontend: React 18, TypeScript, Vite, React Router, React Query, TailwindCSS with Shadcn/Radix UI.
- Messaging: WAHA (WhatsApp HTTP API) for send/receive; n8n webhooks for AI/template generation and assistant flows.
- Deployment: Dockerfiles for backend and frontend, composed via `docker-compose.yml`.

## Backend (Flask API)
Key responsibilities:
- Auth: session cookies via Flask-Login (`/api/auth/login`, `/api/auth/me`, `/api/auth/logout`), admin-only user management.
- Data model: `User`, `Lead`, `List` (segments), `Message`, `Template`, `ScheduledMessage`; SQLite stored in `backend/instance/buildesk.db`.
- Contacts & lists: CRUD for leads, bulk update, list membership, list broadcast via WAHA.
- Messaging: `/api/send` to dispatch via WAHA; `/api/conversation/<phone>` syncs recent WAHA messages into local history.
- Templates: CRUD plus `/api/templates/ai-generate` using `N8N_WEBHOOK_URL`.
- AI helpers: `/api/helpbot` (chat proxy to `N8N_NAVIGATOR_URL`) and `/api/ai-assist` (reply suggestions via `N8N_FORGE_URL`).
- Scheduler: APScheduler job every 30s picks `ScheduledMessage` rows due in IST and sends via WAHA; REST for create/update/delete/retry and batch scheduling for a list.
- Telemetry: `/api/dashboard/stats` aggregates counts, stage distributions, and 7-day timelines.
- Session/status: `/api/session/status` checks WAHA connectivity.

Service config highlights:
- SQLite file lives under `backend/instance/`; directory is created if missing.
- Default admin user `admin/buildesk` is created on first boot.
- Background worker runs inside the Flask process via APScheduler.
- CORS allows `http://localhost:5173`/`8080` with credentials for the SPA.

Important environment variables:
- `SECRET_KEY` (flask session secret; default hardcoded).
- `WAHA_API` (e.g., `http://waha:3000`), `WAHA_KEY` (API key).
- `N8N_WEBHOOK` (template forge), `N8N_NAVIGATOR_URL` (help bot), `N8N_FORGE_URL` (AI assist).
- `N8N_WEBHOOK_URL` also read for template generation; defaults target the bundled n8n service.

## Frontend (React/Vite SPA)
Application entry: `src/main.tsx` mounts `App.tsx`. Routes are wrapped in `ProtectedRoute` that calls `/api/auth/me`; unauthenticated users are redirected to `/login`.

Primary screens/components:
- `pages/Login.tsx` – credential form with local theme toggle.
- `pages/Index.tsx` – main dashboard; switches between chat hub and analytics view, exposes modals for templates, scheduler, list/contacts, and admin users; shows WAHA link status and live stats.
- `pages/NotFound.tsx` – fallback route.
- `components/ContactList.tsx` – lead directory with filtering, CRUD, bulk select/import/actions.
- `components/ChatInterface.tsx` – message timeline and composer; polls `/api/conversation/<phone>` and sends via `/api/send`; AI Assist button calls `/api/ai-assist`; injects template bodies.
- `components/SchedulerView.tsx` – schedule creation (single or list broadcast), edit, retry, bulk actions; uses `/api/schedule*`.
- `components/TemplateLabModal.tsx` – template CRUD, AI generation (`/api/templates/ai-generate`), and inject/copy helpers.
- `components/DashboardAnalytics.tsx` – charts and KPIs fed by `/api/dashboard/stats`.
- `components/HelpBot.tsx` – floating assistant wired to `/api/helpbot`.
- Additional modals: list manager, user management, admin user creation, bulk import/action utilities, WAHA status pill, theme toggle, etc.

Data layer:
- `src/lib/api.ts` centralizes REST calls to `/api`, adds JSON/error handling, redirects to `/login` on 401, and includes typed models.
- React Query powers caching, polling (contacts, WAHA status, stats, schedules), and mutations.

Styling/UI:
- TailwindCSS with Shadcn-generated UI primitives under `src/components/ui/`.
- Layout and theming controlled via CSS variables; dark/light toggle on login.

## Service Topology (`docker-compose.yml`)
- `buildesk-backend`: Flask API on `:5000`, mounted `backend/instance` volume for SQLite.
- `buildesk-frontend`: Nginx serving built SPA on `:80`, proxies `/api` to backend.
- `waha`: WhatsApp transport on `:3000`, API key `WAHA_API_KEY`.
- `n8n`: automation/LLM pipelines on `:5678` with basic auth.

## Running the Stack
### With Docker (recommended)
```bash
cd /root/buildesk
docker compose up --build
```
Frontend: http://localhost (or mapped host), Backend API: http://localhost:5000 (through Nginx proxy). WAHA at http://localhost:3000, n8n at http://localhost:5678 (basic auth).

### Backend only (local)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export FLASK_ENV=development  # optional
python app.py  # runs on :5000 and creates admin/buildesk if missing
```

### Frontend only (local)
```bash
cd frontend
npm install
npm run dev   # Vite dev server on :5173, expects API at /api
```

## Data & State
- SQLite DB: `backend/instance/buildesk.db` (persisted via docker volume mount).
- WAHA and n8n store state in their respective volumes (`waha_data`, `n8n_data`).

## API Surface (selected)
- Auth: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`.
- Contacts: `GET/POST /api/contacts`, `PUT/DELETE /api/contacts/:id`, `PUT /api/contacts/bulk-update`.
- Lists: `GET/POST /api/lists`, `GET/DELETE /api/lists/:id`, `POST /api/lists/:id/add-leads`, `POST /api/lists/:id/remove-lead`, `POST /api/lists/:id/broadcast`.
- Messaging: `GET /api/conversation/:phone`, `POST /api/send`.
- Templates: `GET/POST /api/templates`, `PUT/DELETE /api/templates/:id`, `POST /api/templates/ai-generate`.
- Scheduler: `GET/POST /api/schedule`, `POST /api/schedule/batch`, `PUT/DELETE /api/schedule/:id`, `POST /api/schedule/retry/:id`.
- AI helpers: `POST /api/helpbot`, `POST /api/ai-assist`; status: `GET /api/session/status`.
- Analytics: `GET /api/dashboard/stats`.

## Notes & Defaults
- CORS is configured for localhost dev ports and sends credentials; keep front/back on same origin in production (Docker setup handles this).
- Hardcoded secrets (`SECRET_KEY`, WAHA/n8n credentials) ship with defaults in compose; override for real deployments.
- WAHA session name defaults to `default`; change in API calls if you customize WAHA.

## Next Steps
- Replace default secrets and basic-auth passwords.
- Add TLS termination in front of Nginx for production.
- Add tests (none currently) for critical flows: auth, contacts CRUD, scheduler dispatch, template AI parsing.
