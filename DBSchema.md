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

### 4. `sessions`
(Used for VOD content and platform sessions - structure currently in development)

---

## Database Functions & Triggers

### `handle_new_user()`
**Trigger:** `ON auth.users INSERT`
Automatically creates a corresponding entry in the `public.profiles` table whenever a new user signs up.

```sql
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'student');
  return new;
end;
```

---

## Roles and Permissions

- **Student:** Default role. Can browse mentors, book sessions, and watch library videos.
- **Mentor:** Can set availability and approve/decline session requests.
- **Admin:** Full system access, user management, and platform monitoring.
