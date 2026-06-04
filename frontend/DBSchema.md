# Supabase Database Schema - Soul Of Universe LMS

This file serves as the single source of truth for the Supabase database structure, including tables, columns, relationships, and Row Level Security (RLS) rules.

## Tables

### 1. `profiles`

Stores user profile information, extending the base `auth.users` table.

| Column       | Type        | Description                                                    |
| :----------- | :---------- | :------------------------------------------------------------- |
| `id`         | `uuid` (PK) | References `auth.users.id`.                                    |
| `email`      | `text`      | User's email address.                                          |
| `full_name`  | `text`      | User's display name.                                           |
| `avatar_url` | `text`      | URL to the user's profile picture.                             |
| `bio`        | `text`      | Biography (mainly for mentors).                                |
| `dob`        | `date`      | Date of birth.                                                 |
| `role`       | `text`      | User role: `student`, `mentor`, or `admin`.                    |
| `status`     | `text`      | Account approval status: `pending`, `approved`, or `rejected`. |
| `created_at` | `timestamp` | Time when the profile was created.                             |

**RLS Rules:**

- `Users can view own profile`: `SELECT` allowed where `auth.uid() = id` (no subqueries — avoids recursive RLS).
- `Admins can view all profiles via JWT`: `SELECT` allowed where `auth.jwt() #>> '{app_metadata, user_role}' = 'admin'` (reads admin role from JWT `raw_app_meta_data`, no subquery on profiles).
- `Users can update their own profiles`: `UPDATE` allowed where `auth.uid() = id`.

**Triggers:**

- `on_profile_change_sync_jwt`: After `INSERT OR UPDATE OF role, status` on `profiles`, executes `sync_profile_to_auth_metadata()` to sync role/status into `auth.users.raw_app_meta_data` for JWT-based RLS.

**Indexes:**

- `idx_profiles_status`: B-tree index on the `status` column.

---

### 2. `user_approval_requests`

Tracks approval requests for new user registrations.

| Column         | Type          | Description                                           |
| :------------- | :------------ | :---------------------------------------------------- |
| `id`           | `uuid` (PK)   | Unique identifier (default: `gen_random_uuid()`).     |
| `user_id`      | `uuid` (FK)   | References `profiles.id`. ON DELETE CASCADE.          |
| `status`       | `text`        | Request status: `pending`, `approved`, or `rejected`. |
| `requested_at` | `timestamptz` | When the approval request was created.                |
| `reviewed_at`  | `timestamptz` | When the request was reviewed by an admin.            |
| `reviewed_by`  | `uuid` (FK)   | References `profiles.id` (the admin who reviewed).    |
| `notes`        | `text`        | Admin notes about the decision.                       |
| `created_at`   | `timestamptz` | Row creation timestamp.                               |
| `updated_at`   | `timestamptz` | Last update timestamp.                                |

**RLS Rules:**

- `Users can view own approval requests`: `SELECT` where `auth.uid() = user_id`.
- `Admins can view all approval requests`: `SELECT` where user role is `admin`.
- `Admins can update approval requests`: `UPDATE` where user role is `admin`.
- `Service role can insert approval requests`: `INSERT` for service role only.

---

### 3. `mentor_availability`

Stores recurring weekly availability slots for mentors.

| Column        | Type        | Description                       |
| :------------ | :---------- | :-------------------------------- |
| `id`          | `uuid` (PK) | Unique identifier for the slot.   |
| `mentor_id`   | `uuid` (FK) | References `profiles.id`.         |
| `day_of_week` | `integer`   | 0 (Sunday) to 6 (Saturday).       |
| `start_time`  | `time`      | Start of the availability window. |
| `end_time`    | `time`      | End of the availability window.   |

**RLS Rules:**

- `Availability viewable by everyone`: `SELECT` allowed for all users.
- `Mentors can manage their own availability`: `INSERT`, `UPDATE`, `DELETE` allowed where `auth.uid() = mentor_id`.

---

### 3. `appointments`

Stores booking requests and confirmed sessions between students and mentors.

| Column       | Type        | Description                                              |
| :----------- | :---------- | :------------------------------------------------------- |
| `id`         | `uuid` (PK) | Unique identifier for the appointment.                   |
| `mentor_id`  | `uuid` (FK) | References `profiles.id` (the mentor).                   |
| `student_id` | `uuid` (FK) | References `profiles.id` (the student).                  |
| `start_time` | `timestamp` | Start time of the session.                               |
| `end_time`   | `timestamp` | End time of the session.                                 |
| `status`     | `text`      | Status: `pending`, `scheduled`, `declined`, `completed`. |
| `created_at` | `timestamp` | Time when the booking was requested.                     |

**RLS Rules:**

- `Students can see their own appointments`: `SELECT` where `auth.uid() = student_id`.
- `Mentors can see appointments booked with them`: `SELECT` where `auth.uid() = mentor_id`.
- `Approved students can create appointments via JWT`: `INSERT` where `auth.jwt() #>> '{app_metadata, user_role}' = 'student'` AND `auth.jwt() #>> '{app_metadata, user_status}' = 'approved'`.
- `Mentors can update appointment status`: `UPDATE` allowed where `auth.uid() = mentor_id` (specifically for status updates).

---

### 4. `videos`

Stores video content metadata for the VOD library.

| Column       | Type            | Description                                       |
| :----------- | :-------------- | :------------------------------------------------ |
| `id`         | `uuid` (PK)     | Unique identifier (default: `gen_random_uuid()`). |
| `title`      | `text`          | Title of the video.                               |
| `slug`       | `text` (Unique) | URL-friendly identifier.                          |
| `master_url` | `text`          | URL to the master video file.                     |
| `thumb_url`  | `text`          | URL to the video thumbnail.                       |
| `status`     | `text`          | Processing status (default: `processing`).        |
| `metadata`   | `jsonb`         | Stores duration, resolution, and other metadata.  |
| `created_at` | `timestamptz`   | Timestamp when created.                           |
| `updated_at` | `timestamptz`   | Timestamp when last updated.                      |

**RLS Rules:**

- `Approved users can view videos via JWT`: `SELECT` where `auth.jwt() #>> '{app_metadata, user_status}' = 'approved'`.
- `Allow service role to manage videos`: `ALL` for `service_role`.

**Indexes:**

- `idx_videos_slug`: B-tree index on the `slug` column.

---

### 5. `group_sessions`

Stores the scheduled meetings created by mentors.

| Column                 | Type          | Description                                                 |
| :--------------------- | :------------ | :---------------------------------------------------------- |
| `id`                   | `uuid` (PK)   | Unique identifier for the session.                          |
| `mentor_id`            | `uuid` (FK)   | References `profiles.id` (the host).                        |
| `title`                | `text`        | Title of the meeting.                                       |
| `description`          | `text`        | Details about the meeting.                                  |
| `scheduled_start_time` | `timestamptz` | When the meeting is supposed to start.                      |
| `scheduled_end_time`   | `timestamptz` | When the meeting is supposed to end.                        |
| `status`               | `text`        | `scheduled`, `live`, `completed`, `cancelled`.              |
| `require_approval`     | `boolean`     | If `true`, participants need manual approval to enter.      |
| `is_recorded`          | `boolean`     | If `true`, the meeting will be recorded via LiveKit Egress. |
| `created_at`           | `timestamptz` | Timestamp when created.                                     |

**RLS Rules:**

- `Approved users can view sessions via JWT`: `SELECT` where `auth.jwt() #>> '{app_metadata, user_status}' = 'approved'`.
- `Mentor manage`: Mentors can `INSERT`, `UPDATE`, `DELETE` where `auth.uid() = mentor_id`.

---

### 6. `session_participants`

Handles the "Waiting Room" and tracks who attended.

| Column       | Type          | Description                                |
| :----------- | :------------ | :----------------------------------------- |
| `id`         | `uuid` (PK)   | Unique identifier.                         |
| `session_id` | `uuid` (FK)   | References `group_sessions.id`.            |
| `user_id`    | `uuid` (FK)   | References `profiles.id`.                  |
| `status`     | `text`        | `waiting`, `approved`, `joined`, `denied`. |
| `joined_at`  | `timestamptz` | When the user was admitted/joined.         |

**RLS Rules:**

- `User view/insert`: Users can `SELECT` and `INSERT` their own records (to join/request access).
- `Mentor manage`: Mentors can `SELECT` and `UPDATE` records for their own sessions (to admit/deny).

---

### 7. `session_chats`

Stores the persisted chat history for a session.

| Column       | Type          | Description                                              |
| :----------- | :------------ | :------------------------------------------------------- |
| `id`         | `uuid` (PK)   | Unique identifier.                                       |
| `session_id` | `uuid` (FK)   | References `group_sessions.id`.                          |
| `sender_id`  | `uuid` (FK)   | References `profiles.id`.                                |
| `message`    | `text`        | The chat message content.                                |
| `sent_at`    | `timestamptz` | When the message was originally sent during the meeting. |

**RLS Rules:**

- `Public view`: Authenticated users can `SELECT` chats for sessions they attended.
- `Insert`: Managed via Service Role in Edge Functions.

---

### 8. `meeting_logs`

Maintains logs of meeting events (joins, leaves, raises hand, errors) for debugging and review.

| Column       | Type          | Description                                                                                  |
| :----------- | :------------ | :------------------------------------------------------------------------------------------- |
| `id`         | `uuid` (PK)   | Unique identifier.                                                                           |
| `session_id` | `uuid` (FK)   | References `group_sessions.id`.                                                              |
| `event_type` | `text`        | e.g., `participant_joined`, `chat_saved`, `recording_started`, `recording_stopped`, `error`. |
| `payload`    | `jsonb`       | Additional context and metadata about the event.                                             |
| `created_at` | `timestamptz` | Timestamp of the event.                                                                      |

**RLS Rules:**

- `Mentor view`: Mentors can `SELECT` logs for their own sessions.
- `Insert`: Managed via Service Role in Edge Functions and LiveKit Webhooks.

---

### 9. `session_recordings`

Stores metadata for LiveKit Egress recordings. Each recording corresponds to a single egress session.

| Column          | Type          | Description                                                         |
| :-------------- | :------------ | :------------------------------------------------------------------ |
| `id`            | `uuid` (PK)   | Unique identifier (default: `gen_random_uuid()`).                   |
| `session_id`    | `uuid` (FK)   | References `group_sessions.id`. ON DELETE CASCADE.                  |
| `egress_id`     | `text`        | LiveKit Egress ID for this recording. Nullable until egress starts. |
| `status`        | `text`        | `starting`, `recording`, `uploading`, `completed`, or `failed`.     |
| `file_path`     | `text`        | Server filesystem path (e.g., `/recordings/{session_id}/{id}.mp4`). |
| `file_url`      | `text`        | Playback URL for the recording.                                     |
| `file_size`     | `bigint`      | File size in bytes.                                                 |
| `duration_secs` | `integer`     | Recording duration in seconds.                                      |
| `started_at`    | `timestamptz` | When recording started.                                             |
| `completed_at`  | `timestamptz` | When egress finished processing.                                    |
| `error_message` | `text`        | Error details if status is `failed`.                                |
| `created_at`    | `timestamptz` | Row creation timestamp.                                             |
| `updated_at`    | `timestamptz` | Last update timestamp.                                              |

**Indexes:**

- `idx_session_recordings_session_id`: B-tree on `session_id`.
- `idx_session_recordings_egress_id`: B-tree on `egress_id`.

**RLS Rules:**

- `Mentors can view their session recordings`: `SELECT` where mentor owns the session.
- `Admins can view all recordings`: `SELECT` where user role is `admin`.
- `Insert/Update`: Managed via Service Role in Edge Functions.

---

## Database Functions & Triggers

### `handle_new_user()`

**Trigger:** `ON auth.users INSERT`
Automatically creates a corresponding entry in the `public.profiles` table with `pending` status and creates an approval request whenever a new user signs up.

```sql
begin
  -- Create profile with pending status
  INSERT INTO public.profiles (id, email, full_name, role, dob, status)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    COALESCE(new.raw_user_meta_data->>'role', 'student'),
    (new.raw_user_meta_data->>'dob')::date,
    'pending'
  );

  -- Create approval request
  INSERT INTO public.user_approval_requests (user_id, status, requested_at)
  VALUES (new.id, 'pending', now());

  return new;
end;
```

### `approve_user(target_user_id, approved, admin_notes)`

**Function:** Allows admins to approve or reject user registration requests. Uses JWT metadata (`app_metadata.user_role`) for authorization instead of querying the `profiles` table (avoids recursive RLS). Updating the profile status triggers `on_profile_change_sync_jwt` which syncs the new status into the user's JWT.

```sql
CREATE OR REPLACE FUNCTION public.approve_user(
  target_user_id uuid,
  approved boolean,
  admin_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  admin_id uuid;
  new_status text;
  role_from_jwt text;
BEGIN
  -- Extract role from JWT with an explicit JSON path to avoid jsonb/unknown operator issues
  role_from_jwt := (auth.jwt() #>> '{app_metadata,role}')::text;

  IF role_from_jwt != 'admin' THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: Admin access required');
  END IF;

  admin_id := auth.uid();
  new_status := CASE WHEN approved THEN 'approved' ELSE 'rejected' END;

  UPDATE public.profiles
  SET status = new_status
  WHERE id = target_user_id;

  UPDATE public.user_approval_requests
  SET
    status = new_status,
    reviewed_at = now(),
    reviewed_by = admin_id,
    notes = admin_notes,
    updated_at = now()
  WHERE user_id = target_user_id AND status = 'pending';

  RETURN json_build_object('success', true, 'status', new_status);
END;
$$;
```

### `sync_profile_to_auth_metadata()`

**Trigger:** `on_profile_change_sync_jwt` — Fires after `INSERT OR UPDATE OF role, status` on `public.profiles`. Syncs `role` and `status` into `auth.users.raw_app_meta_data` so JWT-based RLS policies can read them without querying the `profiles` table.

```sql
CREATE OR REPLACE FUNCTION public.sync_profile_to_auth_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  current_metadata jsonb;
BEGIN
  SELECT raw_app_meta_data INTO current_metadata
  FROM auth.users
  WHERE id = NEW.id;

  IF current_metadata IS NULL THEN
    current_metadata := '{}'::jsonb;
  END IF;

  UPDATE auth.users
  SET raw_app_meta_data = current_metadata || jsonb_build_object(
    'user_role', NEW.role,
    'user_status', NEW.status
  )
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_change_sync_jwt ON public.profiles;
CREATE TRIGGER on_profile_change_sync_jwt
  AFTER INSERT OR UPDATE OF role, status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_to_auth_metadata();
```

---

## Roles and Permissions

- **Student:** Default role. Can browse mentors, book sessions, and watch library videos.
- **Mentor:** Can set availability and approve/decline session requests.
- **Admin:** Full system access, user management, and platform monitoring.
