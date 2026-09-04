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

## Video Engine (`video-engine/`)
Background transcoding service (Python, watchdog + ffmpeg) that watches an input directory, transcodes to HLS, and syncs status to Supabase. Shutdown: SIGTERM/SIGINT set a `threading.Event` that the main loop waits on, then the process `sys.exit(0)`s — it deliberately does NOT `observer.join()` after cleanup because watchdog's fsevents observer can block forever on macOS. Tests live in `video-engine/tests/test_shutdown.py` (subprocess signal tests).

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
- Conferencing: LiveKit rooms (`session_participants` tracks attendance). Admin is co-host (visible `Admin` badge, join-muted AV) — controls mirror mentor: Start/End session, Mute All / Mute user, Lower Hand, Share Screen. Identity (mentor badge/track pinning, Host Reconnecting tile) stays `mentorId`; host-drop `livekit-webhook` remains mentor-only. RLS co-host grant in `20260819000001_admin_cohost_session_participants.sql` uses JWT `user_role=admin` + `user_status=approved` (no `EXISTS` recursion). All reconnection/audio-resilience logic lives in `components/conferencing/MeetingView.tsx` (not in feature hooks).
- Conferencing resilience: Room options `disconnectOnPageLeave: false`, `stopLocalTrackOnUnpublish: false`, `stopMicTrackOnMute: false`, custom `reconnectPolicy` (~80s SDK retry budget before app-level rejoin). Disconnect handling branches on the real `DisconnectReason` from `RoomEvent.Disconnected`: `CLIENT_INITIATED` → no log/no rejoin; `DUPLICATE_IDENTITY`/`PARTICIPANT_REMOVED` → rejoin blocked with "joined from another tab/device" UX (prevents multi-tab kick-ping-pong); `ROOM_DELETED` → terminal "session ended" UX; network drops → host auto-rejoins with a fresh token (bounded backoff 2s→32s, 5 attempts, then manual fallback), refreshing expired Supabase auth mid-rejoin. `livekit-get-token` removes stale participants before minting tokens (prevents DUPLICATE_IDENTITY join failures) and returns proper 403 JSON for not-live sessions. `livekit-webhook` logs host drops (`host_left_room`) and auto-ends orphaned sessions (`session_auto_ended_host_gone`). The webhook's `room.numParticipants` is a cached room proto snapshot (refresh ~5s, normal leaves mark non-immediate), so it can still count the leaving host — orphaned-session cleanup must not rely on `<=1`; it lists participants live and only ends when no participant other than the host remains. Only the LiveKit room deletion is gated on `LIVEKIT_URL` — the DB cleanup (session completed, pending rejections, audit log) always runs so an orphaned session can't stay live forever when the env var is unset. Session-end signaling: data-channel `SESSION_ENDED` broadcast plus `isSessionEnded: true` in the ending host's metadata (mentor or admin co-host); students react to it **instantly** via `RoomEvent.ParticipantMetadataChanged` (the 3s metadata poll is only the fallback) — this prevents the "Host Reconnecting" tile from flashing during the room-deletion window between End confirm and the edge function completing. The local stale-flag cleanup runs once on first mount only — never on later re-renders — so a `useLocalParticipant` re-render during the mentor's End Session handler cannot erase the just-written `isSessionEnded` flag before `setSessionStatus("ended")` commits. Connection-state UI maps the SDK's intermediate states (`Connecting`, `SignalReconnecting` — signal-only reconnect with media still up) onto the "reconnecting" banner/overlay instead of raw-casting, so mobile signal-only reconnects render feedback while the SDK recovers. End-of-session redirect timer (`endPollTimerRef`, 3s then disconnect+navigate home) is cleared only in the unmount-only effect — not in the polling effect's cleanup, which runs on every `sessionStatus` change and would cancel the redirect immediately after scheduling it. `attemptRejoin` reads the live participant through `localParticipantRef` and calls `scheduleRejoin` via `scheduleRejoinRef` (broken dependency cycle) so a first-render-undefined `localParticipant` can never cause a rejoin that skips mic/camera re-assert or logs `user_id: undefined`; `logEvent`/`resumeAudio`/`logDisconnect` also use `localParticipantRef` and are stable callbacks.
- Host-drop student UX: "Host Reconnecting" tile is driven by the host's `ConnectionQuality.Lost` signal (fires within seconds of a drop) in addition to identity/track presence — covers the departure_timeout window where the host's frozen camera track still lingers in the room, so students never see a black/frozen screen.
- Mobile audio interruption recovery: `RoomEvent.AudioPlaybackStatusChanged` (canonical signal) + `visibilitychange`/`pageshow`(bfcache)/`focus`/`online` handlers → `resumeAudio()` (`room.startAudio()` + mic/camera re-assert) with "Tap to resume" gesture fallback; `reattachRemoteAudio()` re-creates remote `<audio>` elements if iOS destroyed them (only when a subscribed track has zero attached elements — never touches `RoomAudioRenderer` elements; cleaned up on track unsubscribe/unmount).
- Reconnection telemetry: `meeting_logs` events via `livekit-manage-session` actions `log_disconnect` (real `DisconnectReason` names) / `log_event` (`host_rejoin_attempt`, `host_rejoined`, `host_reconnected` — latter only after a real drop, `stale_participant_cleaned`). Monitor these post-deploy to verify resilience fixes. `log_disconnect`/`log_event` derive identity from the authenticated user (never the request payload), compute `is_host` from `group_sessions.mentor_id`, and reject callers who are neither host, trusted mentor/admin (only when `profiles.status === "approved"`), nor an admitted session participant (`session_participants.status IN ('approved','joined')` — 403). Client `event_type` is whitelisted to the documented telemetry names (`host_rejoin_attempt`, `host_rejoined`, `host_reconnected`, `generic_event`) so a caller can't inject server-owned lifecycle names like `session_ended`/`recording_started`, and every client-supplied value is type/len-bound before writing the jsonb payload. Authorization logic lives in `supabase/functions/livekit-manage-session/telemetry_auth.ts` (unit-tested in `telemetry_auth_test.ts` — pending/rejected mentors, waiting/rejected participants, identity mismatch); the caller passes the participant row unfiltered and the admitted-status rule (`approved`/`joined`) is enforced inside the pure function, which also requires `participantRow.participantUserId === callerUserId` (the row's `user_id`, not the DB row `id`) so a query returning an admitted row for a *different* user can never authorize the caller.
- Device check: standalone module at `frontend/src/features/conferencing/device-check/` (`useDeviceCheck` hook + `DeviceCheckPanel`) with zero LiveKit/`MeetingView` imports. `MeetingPage` renders it when `status === "permissions"` (green room) before mounting `MeetingView`; the panel's unmount cleanup stops its probe stream so LiveKit opens fresh tracks. One combined `getUserMedia({video:true,audio:true})` prompt for every role; `requireMedia={isHost}` blocks mentor + admin co-host until both are granted, students get warnings only. Also reachable anytime at `/device-check` (route + sidebar/mobile nav in `App.tsx`).
- Mobile navigation: fixed primary bottom bar (Dashboard, Library, Admin, Profile, More) + "More" bottom sheet for secondary/utility items (Device check, theme toggle, Sign out). New nav items that aren't primary destinations must set `secondary: true` in `navItems` (`App.tsx`) so they land in the sheet instead of cluttering the mobile bar; the desktop sidebar always shows all items.
- Video library: HLS playback via Video.js with quality selector
- VC server readiness: the `start` action in `livekit-manage-session` pings LiveKit (`RoomServiceClient.listRooms`, 5s timeout) BEFORE any DB write — an unreachable server returns `503 VC_SERVER_NOT_READY` and the session stays `scheduled`; `MeetingPage` maps it to an inline "VC Server is not ready yet. Please wait." warning for the host (mentor or admin co-host), who retries after booting the server. Env-unset deployments skip the gate.
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
| Conferencing | Built | LiveKit rooms, host auto-rejoin, mobile audio interruption recovery, Lost-quality host-reconnecting fallback, disconnect-reason-based recovery branching, admin co-host (mirrors mentor controls, Admin badge, join-muted) |
| Device Check (Pre-join) | Built | Standalone mic/camera permission + live mic-level check at `/device-check`; pre-join green room gates every meeting join — hosts (mentor + admin co-host) blocked until both granted, students warned but never blocked |
| Admin Dashboard | In Progress | Stats, logs, infrastructure health, user approval management |
| Session Chat | Built | Persisted chat history via `session_chats` |
| Meeting Logs | Built | Event tracking (joins, leaves, errors, reconnection telemetry) via `meeting_logs` |
| Session Recording | Built | LiveKit Egress with FilesysUpload, mentor+admin access, `session_recordings` table |
| Password Reset (Admin) | Built | Admin resets student/mentor passwords via `admin-reset-password` edge function |
| Password Change (Self) | Built | Users change own password via `/profile` settings page |

## Common Workflows
- **Adding a new table:** Create migration in `supabase/`, update RLS, update `frontend/DBSchema.md`
- **Adding a feature module:** Create directory under `frontend/src/features/<name>/`, add route in router config
- **Edge functions:** Located in `supabase/functions/`, deployed via Supabase CLI
