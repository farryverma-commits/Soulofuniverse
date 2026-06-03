# Soul of Universe — Design Brief

## Register

**Product.** This is an authenticated LMS application with dashboards, forms, calendars, video playback, and live conferencing. Design earns trust through consistency and speed. Operators who open this daily should move without thinking.

## What It Is

A dual-interface Learning Management System connecting students with mentors through live sessions, 1-on-1 bookings, and a video library. Three roles: **student** (learner), **mentor** (host/teacher), **admin** (platform operator).

## Users

- **Students** arrive to attend sessions, book mentors, and watch recordings. They are learners under schedule pressure — they need to find the next thing fast and join it.
- **Mentors** manage availability, host live sessions, approve bookings, and create content. They need control without friction.
- **Admins** monitor platform health, manage users, and track activity. They need status at a glance, not decoration.

## Core Surfaces

| Surface | Work Pattern | Primary Job |
|---|---|---|
| Student Dashboard | **Monitor** | See next session, join group rooms, browse upcoming |
| Booking Page | **Configure** | Find a mentor, pick a slot, confirm |
| Video Library | **Explore** | Browse, discover, watch recordings |
| Admin Dashboard | **Monitor** | Stats, logs, infrastructure health |
| Scheduler (Mentor) | **Operate** | Set availability, manage requests |
| Live Meeting | **Operate** | Full-screen conferencing with chat |
| Auth (Login/Register) | **Configure** | Enter credentials, create account |

## Voice

Professional, calming, intellectually stimulating. The brand name "Soul of Universe" carries weight — the design should feel grounded and contemplative, not corporate or playful. Words like "Seeker" for students signal a learning journey, not a transaction.

**Do:** "Continue your journey", "Your next session", "Browse Mentors", "Scanning the cosmos", "The stars align"
**Don't:** "Get started", "Let's go!", "Welcome to your dashboard!", "Loading..."

## Anti-References

- No SaaS dashboard template feel (generic stat cards with colored circles)
- No purple/blue-to-cyan gradient gradients signaling "AI startup"
- No centered hero + 3-card grid as default composition
- No pill-shaped buttons for every action
- No Excessive card nesting (card inside card)
- No marketing fluff in a product surface

## Current Design DNA — Cosmic Depths (2026 Redesign)

The interface now lives in deep space: a dark cosmic canvas with starlight gold as the primary hue and cosmic purple as accent. The brand identity pulls every surface into the universe — vast, calm, profound, like a planetarium at night.

- **Direction**: Cosmic Depths. Contemplative, grounded, vast. Not flashy sci-fi, not corporate dark mode. The cosmos is the brand.
- **Typography**: Inter (body). Heavy weights (700-800) for headings, medium (500) for body. One family, clean hierarchy.
- **Color — Dark cosmic whisper**:
  - Canvas: `#0A0A14` (deep space), Surface: `#12121F`, Surface Raised: `#18182A`
  - Text: `#F0EDF5` (star white), Text Secondary: `#8B87A3`, Text Muted: `#5C5873`
  - Primary: `#D4A853` (starlight gold) — the star that guides
  - Accent: `#7B5EA8` (cosmic purple) — the unknown depths
  - Success: `#3BAF7A`, Error: `#E04E4E`, Warning: `#D4A843`
  - Nav sidebar: `#060610` (void)
- **Surface treatment**: Dark cards with 1px subtle borders (`#1E1C2E`). Raised surfaces shift to `#18182A`. Cards have subtle glow (`card-glow`) with primary-tinted box shadow. Brand imagery integrated into hero sections and auth panels.
- **Component patterns**: `card`, `card-hover`, `card-glow`, `btn-primary` (gold on dark), `btn-secondary` (outlined), `btn-danger` (red tint), `input` (dark fields), `badge` system. Logo (`logo soul of universe.png`) in sidebar, auth panels, and loading screen. Cosmic imagery (`IMG_1732.PNG`) as hero background and brand panel texture.
- **Density**: Generous spacing. Cards breathe. Not cramped.
- **Copy voice**: Cosmic but grounded. "Seeker" for students, "Continue your journey", "Scanning the cosmos", "The stars align", "Part of the cosmos". No SaaS clichés.

## Visual Foundation

- **Palette commitment level**: Whisper. Gold primary on deep space surfaces. Color is rare enough to mean something. Purple accent deepens the cosmic feel. **Dual-theme**: dark (default) and light, toggled via sidebar button. Light theme swaps canvas to `#F8FAFC`, surfaces to white, and text to near-black. Conferencing UI stays dark in both themes.
- **Border radius**: 8-16px for components, 14px for cards, 24px for modals and hero sections. Round but grounded.
- **Shadows**: Subtle glow (`box-shadow` tinted with primary gold at 3% opacity). Depth from tonal shifts, not heavy shadows.
- **Motion**: Subtle. Slide-up entrances, scale-on-active for buttons, hover color transitions. Gold glow on primary button hover. Orbital loading animations with multi-ring spins.
- **Spacing scale**: Tailwind default 4px base. Sections separated by 32-64px. Cards padded 20-24px.

## Accessibility

- Focus rings on all interactive elements (2px offset, 3:1 contrast minimum)
- 44x44px minimum touch targets on mobile
- Color is never the sole indicator of state (paired with icons or text)
- Semantic HTML structure with proper heading hierarchy
- LiveKit conferencing UI needs keyboard navigation support

## Tech Constraints

- React 19 + Vite 8 + TypeScript 6
- Tailwind CSS v4 (with CSS-first config via `@theme` in `index.css`)
- Supabase (auth + database + RLS)
- LiveKit for real-time conferencing
- Redux Toolkit for state management
- React Router v7 for navigation
- Video.js for HLS playback
- Lucide React for icons

## Composition Lanes

The project mixes **monitor**, **operate**, **configure**, and **explore** patterns. Each screen should use the composition that matches its work:

- **Monitor** (dashboards): Status boards, metrics, live priority indicators, time-based lists
- **Operate** (scheduler, meeting): Command areas, direct manipulation, calendars, full-screen canvas
- **Configure** (booking, auth): Forms, selections, previews, clear commit actions
- **Explore** (library): Search, filters, galleries, discovery flow with playback

Avoid forcing all screens into the same layout mold.
