# Supabase Database Schema - Soul Of Universe LMS

This file serves as the single source of truth for the Supabase database structure, including tables, columns, relationships, and Row Level Security (RLS) rules.

## Tables

### 1. `profiles`
Stores user profile information, extending the base `auth.users` table.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | References `auth.users.id`. |
| `email` | `text` | User's email address. |
| `full_name` | `text` | User's display name. |
| `avatar_url` | `text` | URL to the user's profile picture. |
| `bio` | `text` | Biography (mainly for mentors). |
| `dob` | `date` | Date of birth. |
| `role` | `text` | User role: `student`, `mentor`, or `admin`. |
| `created_at` | `timestamp` | Time when the profile was created. |

**RLS Rules:**
- `Public profiles are viewable by everyone`: `SELECT` allowed for all authenticated users.
- `Users can update their own profiles`: `UPDATE` allowed where `auth.uid() = id`.

---

### 2. `mentor_availability`
Stores recurring weekly availability slots for mentors.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Unique identifier for the slot. |
| `mentor_id` | `uuid` (FK) | References `profiles.id`. |
| `day_of_week` | `integer` | 0 (Sunday) to 6 (Saturday). |
| `start_time` | `time` | Start of the availability window. |
| `end_time` | `time` | End of the availability window. |

**RLS Rules:**
- `Availability viewable by everyone`: `SELECT` allowed for all users.
- `Mentors can manage their own availability`: `INSERT`, `UPDATE`, `DELETE` allowed where `auth.uid() = mentor_id`.

---

### 3. `appointments`
Stores booking requests and confirmed sessions between students and mentors.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Unique identifier for the appointment. |
| `mentor_id` | `uuid` (FK) | References `profiles.id` (the mentor). |
| `student_id` | `uuid` (FK) | References `profiles.id` (the student). |
| `start_time` | `timestamp` | Start time of the session. |
| `end_time` | `timestamp` | End time of the session. |
| `status` | `text` | Status: `pending`, `scheduled`, `declined`, `completed`. |
| `created_at` | `timestamp` | Time when the booking was requested. |

**RLS Rules:**
- `Students can see their own appointments`: `SELECT` where `auth.uid() = student_id`.
- `Mentors can see appointments booked with them`: `SELECT` where `auth.uid() = mentor_id`.
- `Students can create appointments`: `INSERT` allowed for `student` role.
- `Mentors can update appointment status`: `UPDATE` allowed where `auth.uid() = mentor_id` (specifically for status updates).

---

### 4. `videos`
Stores video content metadata for the VOD library.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Unique identifier (default: `gen_random_uuid()`). |
| `title` | `text` | Title of the video. |
| `slug` | `text` (Unique) | URL-friendly identifier. |
| `master_url` | `text` | URL to the master video file. |
| `thumb_url` | `text` | URL to the video thumbnail. |
| `status` | `text` | Processing status (default: `processing`). |
| `metadata` | `jsonb` | Stores duration, resolution, and other metadata. |
| `created_at` | `timestamptz` | Timestamp when created. |
| `updated_at` | `timestamptz` | Timestamp when last updated. |

**RLS Rules:**
- `Allow authenticated users to read videos`: `SELECT` for `authenticated` users.
- `Allow service role to manage videos`: `ALL` for `service_role`.

**Indexes:**
- `idx_videos_slug`: B-tree index on the `slug` column.

---

### 5. `group_sessions`
Stores the scheduled meetings created by mentors.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Unique identifier for the session. |
| `mentor_id` | `uuid` (FK) | References `profiles.id` (the host). |
| `title` | `text` | Title of the meeting. |
| `description` | `text` | Details about the meeting. |
| `scheduled_start_time` | `timestamptz` | When the meeting is supposed to start. |
| `scheduled_end_time` | `timestamptz` | When the meeting is supposed to end. |
| `status` | `text` | `scheduled`, `live`, `completed`, `cancelled`. |
| `require_approval` | `boolean` | If `true`, participants need manual approval to enter. |
| `is_recorded` | `boolean` | If `true`, the meeting will be recorded via LiveKit Egress. |
| `created_at` | `timestamptz` | Timestamp when created. |

**RLS Rules:**
- `Public view`: All users can `SELECT` scheduled and live sessions to show on dashboards.
- `Mentor manage`: Mentors can `INSERT`, `UPDATE`, `DELETE` where `auth.uid() = mentor_id`.

---

### 6. `session_participants`
Handles the "Waiting Room" and tracks who attended.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Unique identifier. |
| `session_id` | `uuid` (FK) | References `group_sessions.id`. |
| `user_id` | `uuid` (FK) | References `profiles.id`. |
| `status` | `text` | `waiting`, `approved`, `joined`, `denied`. |
| `joined_at` | `timestamptz` | When the user was admitted/joined. |

**RLS Rules:**
- `User view/insert`: Users can `SELECT` and `INSERT` their own records (to join/request access).
- `Mentor manage`: Mentors can `SELECT` and `UPDATE` records for their own sessions (to admit/deny).

---

### 7. `session_chats`
Stores the persisted chat history for a session.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Unique identifier. |
| `session_id` | `uuid` (FK) | References `group_sessions.id`. |
| `sender_id` | `uuid` (FK) | References `profiles.id`. |
| `message` | `text` | The chat message content. |
| `sent_at` | `timestamptz` | When the message was originally sent during the meeting. |

**RLS Rules:**
- `Public view`: Authenticated users can `SELECT` chats for sessions they attended.
- `Insert`: Managed via Service Role in Edge Functions.

---

### 8. `meeting_logs`
Maintains logs of meeting events (joins, leaves, raises hand, errors) for debugging and review.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Unique identifier. |
| `session_id` | `uuid` (FK) | References `group_sessions.id`. |
| `event_type` | `text` | e.g., `participant_joined`, `chat_saved`, `recording_started`, `error`. |
| `payload` | `jsonb` | Additional context and metadata about the event. |
| `created_at` | `timestamptz` | Timestamp of the event. |

**RLS Rules:**
- `Mentor view`: Mentors can `SELECT` logs for their own sessions.
- `Insert`: Managed via Service Role in Edge Functions and LiveKit Webhooks.

---

## Database Functions & Triggers

### `handle_new_user()`
**Trigger:** `ON auth.users INSERT`
Automatically creates a corresponding entry in the `public.profiles` table whenever a new user signs up.

```sql
begin
  insert into public.profiles (id, email, full_name, role, dob)
  values (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'full_name', 
    COALESCE(new.raw_user_meta_data->>'role', 'student'),
    (new.raw_user_meta_data->>'dob')::date
  );
  return new;
end;
```

---

## Roles and Permissions

- **Student:** Default role. Can browse mentors, book sessions, and watch library videos.
- **Mentor:** Can set availability and approve/decline session requests.
- **Admin:** Full system access, user management, and platform monitoring.
