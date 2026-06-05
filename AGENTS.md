# Memory

> **This file is the single source of truth for the entire project.**
> Whenever a new feature is added or an existing feature/functionality changes, this file **must** be updated in the same change to reflect the current state of the project. This includes feature status, architecture changes, new dependencies, workflow updates, and any structural shifts.

## Project Overview
Soul of Universe is a dual-interface Learning Management System (LMS) connecting students with mentors through live sessions, 1-on-1 bookings, and a video library. Three roles: **student** (learner), **mentor** (host/teacher), **admin** (platform operator).

See @brief.md for the full design brief (visual identity, composition lanes, voice, anti-references).

## Tech Stack
- React 19 + Vite 8 + TypeScript 6
- Tailwind CSS v4 (CSS-first config via `@theme` in `frontend/src/index.css`)
- Supabase (auth + database + RLS)
- LiveKit for real-time conferencing
- Redux Toolkit for state management
- React Router v7 for navigation
- Video.js for HLS playback
- Lucide React for icons

## Frontend Structure (`frontend/src/`)
- `features/` — Feature modules: `auth/`, `dashboard/`, `scheduler/`, `library/`, `conferencing/`, `admin/`
- `components/` — Shared UI components
- `pages/` — Route-level page components
- `layouts/` — Layout wrappers
- `store/` — Redux store configuration
- `services/` — API/Supabase service layers
- `hooks/` — Custom React hooks
- `lib/` — Library utilities (Supabase client, etc.)
- `types/` — TypeScript type definitions
- `utils/` — General utility functions
- `config/` — App configuration

## Commands (from `frontend/`)
- `pnpm dev` — Start Vite dev server
- `pnpm build` — Production build
- `pnpm lint` — Run ESLint
- `pnpm preview` — Preview production build

## Database
**Always refer to `frontend/DBSchema.md` as the single source of truth for database structure** — tables, columns, relationships, RLS rules, and functions.

**Critical rule:** Whenever a new table is created, an existing table is modified, or any database-level change occurs (RLS policies, functions, triggers, indexes), `frontend/DBSchema.md` **must** be updated in the same change to keep it in sync.

## Code Style Guidelines
- Use descriptive variable names
- Follow existing patterns in the codebase
- Extract complex conditions into meaningful boolean variables
- Prefer component-level co-location over deep nesting
- Use Tailwind utility classes; avoid custom CSS unless necessary

## Design Principles
- **Palette:** Whisper — blue accent (#2196F3) on neutral surfaces (#F8FAFC, #0F172A)
- **Typography:** Inter (body) + Manrope (display), heavy weights for headings
- **Surface:** White cards with 1px borders, glassmorphism nav, large border-radius (16-24px)
- **Motion:** Subtle slide-ups, scale-on-active, hover transitions. No bouncing/elastic.
- **Voice:** Professional, contemplative. Avoid corporate/playful SaaS tone.

## Architecture Notes
- Auth flow: Supabase Auth → `profiles` table trigger (`handle_new_user()`) auto-creates profile on signup with `pending` status → Admin approval required via `approve_user()` function → User can access platform only after approval
- Password reset: Admins can reset student/mentor passwords via `UserManagement` (calls `admin-reset-password` edge function using service role). Users can change their own password via `/profile` settings page.
- Roles: `student` (default), `mentor`, `admin` — enforced via RLS policies
- User approval: New registrations require admin approval. `user_approval_requests` table tracks approval workflow. RLS policies block unapproved users from accessing protected resources.
- Conferencing: LiveKit rooms with waiting room pattern (`session_participants` table)
- Video library: HLS playback via Video.js with quality selector
- Scheduler: Recurring weekly availability slots (`mentor_availability` table)

## Current Features & Status
Track what's built, in progress, or planned. Update this section whenever features ship or scope changes.

| Feature | Status | Notes |
|---|---|---|
| Auth (Login/Register) | Built | Supabase Auth, auto profile creation via trigger |
| User Approval System | Built | Admin approval required for new registrations, pending/rejected screens |
| Student Dashboard | Built | See next session, join group rooms, browse upcoming |
| Mentor Scheduler | Built | Recurring weekly availability slots |
| Booking System | Built | 1-on-1 appointments between students and mentors |
| Video Library | Built | HLS playback via Video.js with quality selector |
| Conferencing | Built | LiveKit rooms with waiting room pattern |
| Admin Dashboard | In Progress | Stats, logs, infrastructure health, user approval management |
| Session Chat | Built | Persisted chat history via `session_chats` |
| Meeting Logs | Built | Event tracking (joins, leaves, errors) via `meeting_logs` |
| Session Recording | Built | LiveKit Egress with FilesysUpload, mentor+admin access, `session_recordings` table |
| Password Reset (Admin) | Built | Admin resets student/mentor passwords via `admin-reset-password` edge function |
| Password Change (Self) | Built | Users change own password via `/profile` settings page |

## Common Workflows
- **Adding a new table:** Create migration in `supabase/`, update RLS, update `frontend/DBSchema.md`
- **Adding a feature module:** Create directory under `frontend/src/features/<name>/`, add route in router config
- **Edge functions:** Located in `supabase/functions/`, deployed via Supabase CLI
