# RV5 Skill Trust Graph Architecture

## Frontend
- Stack: Vanilla HTML/CSS/JS
- Style: Color-rich glassmorphism with animated gradients + custom doodle-style SVG iconography
- Modules:
  - Dashboard analytics
  - Login
  - Worker onboarding
  - Recruiter onboarding
  - Worker CRUD management
  - Job CRUD management

## Backend
- Stack: Node.js + Express + PostgreSQL
- Data access: `pg` with pooled connections
- Main files:
  - `/Users//Documents/RV5_SkillTrustGraph/backend/src/server.js`
  - `/Users//Documents/RV5_SkillTrustGraph/backend/src/db.js`

## Database Design

### `workers`
Stores worker profile data and trust metadata.

### `worker_badges`
Stores badges/evidence labels linked to a worker.

### `recruiters`
Stores recruiter accounts.

### `jobs`
Stores job postings and links to recruiters.

## CRUD Coverage
- Workers: full CRUD + filters (`trade`, `city`)
- Recruiters: full CRUD
- Jobs: full CRUD + filters (`city`, `status`)
- Onboarding routes map directly to worker/recruiter creation

## Future upgrades
- OTP auth + JWT sessions
- Role-based authorization middleware
- Worker verification evidence table with approval workflow
- Job application lifecycle (`applications` table)
- Notifications (SMS/WhatsApp)
- Geo-search and distance ranking
