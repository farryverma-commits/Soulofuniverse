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

**Do:** "Continue your journey", "Your next session", "Browse Mentors"
**Don't:** "Get started", "Let's go!", "Welcome to your dashboard!"

## Anti-References

- No SaaS dashboard template feel (generic stat cards with colored circles)
- No purple/blue-to-cyan gradient gradients signaling "AI startup"
- No centered hero + 3-card grid as default composition
- No pill-shaped buttons for every action
- No Excessive card nesting (card inside card)
- No marketing fluff in a product surface

## Current Design DNA

The existing interface uses these patterns and they should be respected or evolved intentionally:

- **Typography**: Inter (body) + Manrope (display). Heavy weights (700-900) for headings, medium (500) for body.
- **Color**: Soft blue primary (#2196F3) on white/light gray (#F8FAFC) surfaces. Dark (#0F172A) for text and accent cards.
- **Surface treatment**: White cards with 1px borders and subtle shadows. Glassmorphism (backdrop-blur) on the sticky nav. Large border-radius (2xl/3xl).
- **Density**: Generous spacing. Cards breathe. Not cramped.
- **Component patterns**: `card-premium` for content blocks, `glass-nav` for sticky header, `btn-primary` for CTAs. Lucide icons throughout.

## Visual Foundation

- **Palette commitment level**: Whisper. Blue accent on neutral surfaces. Color is rare enough to mean something.
- **Border radius**: Large (16-24px default, up to 40px for hero elements). Round is the language.
- **Shadows**: Minimal. Rely on borders and tonal shifts. Shadow-2xl reserved for overlays and hero cards.
- **Motion**: Subtle. Slide-up entrances, scale-on-active for buttons, hover color transitions. No bouncing or elastic effects.
- **Spacing scale**: Tailwind default 4px base. Sections separated by 32-40px. Cards padded 24px.

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
