# RV5 Skill Trust Graph

Role-based hiring platform for informal workforce with:
- Admin-controlled onboarding and work assignment
- Worker/recruiter/admin login
- Worker contact + photo + login credential management
- Worker dashboard for assigned jobs
- In-app notifications for activity
- Forgot password and admin reset flows

## Current Features

- Interactive frontend (`frontend/index.html`, `frontend/app.js`, `frontend/styles.css`)
- Node/Express API with PostgreSQL (`backend/src/server.js`)
- Worker CRUD + Recruiter CRUD + Job CRUD
- Admin-only job assignment/unassignment
- Worker-specific "My Assigned Work" view
- Notification center + admin broadcast
- Password reset via:
  - forgot password code flow
  - admin reset endpoint
- One-command startup script: `/Users/gaurishankarvhadle/Documents/RV5_SkillTrustGraph/start.sh`

## Folder Structure

- `/Users/gaurishankarvhadle/Documents/RV5_SkillTrustGraph/frontend` -> HTML/CSS/JS app
- `/Users/gaurishankarvhadle/Documents/RV5_SkillTrustGraph/backend` -> API and DB scripts
- `/Users/gaurishankarvhadle/Documents/RV5_SkillTrustGraph/backend/db/schema.sql` -> schema
- `/Users/gaurishankarvhadle/Documents/RV5_SkillTrustGraph/backend/db/seed.sql` -> seed data
- `/Users/gaurishankarvhadle/Documents/RV5_SkillTrustGraph/start.sh` -> run frontend + backend

## Demo Login Accounts (after seed)

- Admin: `admin` / `admin123`
- Worker: `worker_ramesh` / `worker123`
- Worker: `worker_shankar` / `worker123`
- Recruiter: `recruiter_urban` / `recruiter123`

## Quick Start

```bash
cd /Users/gaurishankarvhadle/Documents/RV5_SkillTrustGraph
./start.sh
```

Frontend: `http://localhost:5500`  
Backend: `http://localhost:4000`

## Manual Setup

### 1) Backend

```bash
cd /Users/gaurishankarvhadle/Documents/RV5_SkillTrustGraph/backend
npm install
cp .env.example .env
```

Edit `.env` if needed:

```env
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rv5_skill_trust_graph
DB_SSL=false
```

Create database once:

```bash
psql "postgresql://postgres:postgres@localhost:5432/postgres" -c "CREATE DATABASE rv5_skill_trust_graph;"
```

Apply schema and seed:

```bash
npm run db:schema
npm run db:seed
```

Run API:

```bash
npm run dev
```

### 2) Frontend

```bash
cd /Users/gaurishankarvhadle/Documents/RV5_SkillTrustGraph/frontend
python3 -m http.server 5500
```

## Forgot Password

From Login tab:
1. Use "Forgot Password (Step 1)" with your identifier.
2. Use generated reset code in "Reset Password (Step 2)".
3. Login again with new password.

## Admin Reset Password

Admin can reset any user password from:
- Admin tab user table (Reset Password button), or
- Admin reset form with user UUID

## Recreate Database From Beginning

Use one command in backend:

```bash
cd /Users/gaurishankarvhadle/Documents/RV5_SkillTrustGraph/backend
npm run db:fresh
```

This runs:
1. `db:reset` (drop and create DB from `DATABASE_URL`)
2. `db:schema`
3. `db:seed`

Then start project again:

```bash
cd /Users/gaurishankarvhadle/Documents/RV5_SkillTrustGraph
./start.sh
```

## Key API Endpoints

### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

### Admin
- `GET /api/admin/users`
- `POST /api/admin/users/:id/reset-password`

### Workers
- `GET /api/workers`
- `GET /api/workers/:id`
- `POST /api/workers` (admin)
- `PUT /api/workers/:id` (admin)
- `DELETE /api/workers/:id` (admin)
- `GET /api/workers/me/jobs` (worker)

### Recruiters
- `GET /api/recruiters`
- `GET /api/recruiters/:id`
- `POST /api/recruiters` (admin)
- `PUT /api/recruiters/:id` (admin)
- `DELETE /api/recruiters/:id` (admin)

### Jobs
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs` (admin)
- `PUT /api/jobs/:id` (admin)
- `POST /api/jobs/:id/assign` (admin)
- `POST /api/jobs/:id/unassign` (admin)
- `DELETE /api/jobs/:id` (admin)

### Notifications
- `GET /api/notifications`
- `POST /api/notifications/broadcast` (admin)
