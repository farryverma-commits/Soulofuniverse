-- Aggressive fix: Drop ALL known profile policies by name
-- Run this in Supabase SQL Editor

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Approved users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Approved users can view other profiles" ON public.profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;
DROP POLICY IF EXISTS "Enable update for users based on id" ON public.profiles;
DROP POLICY IF EXISTS "Allow all authenticated users to read profiles" ON public.profiles;

-- Also drop any policies that reference profiles from other tables' policies
-- that might be causing cross-table recursion
DROP POLICY IF EXISTS "Approved students can create appointments" ON public.appointments;
DROP POLICY IF EXISTS "Approved users can view sessions" ON public.group_sessions;
DROP POLICY IF EXISTS "Approved users can view videos" ON public.videos;

-- Now recreate only what we absolutely need
-- Profiles: users can ALWAYS read their own row (no subquery, no recursion possible)
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Profiles: users can update their own row  
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- Appointments: use uid = student_id instead of querying profiles
DROP POLICY IF EXISTS "Students can see their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Mentors can see appointments booked with them" ON public.appointments;
DROP POLICY IF EXISTS "Students can create appointments" ON public.appointments;
DROP POLICY IF EXISTS "Mentors can update appointment status" ON public.appointments;

CREATE POLICY "Students can manage their appointments"
ON public.appointments FOR ALL
USING (auth.uid() = student_id);

CREATE POLICY "Mentors can manage their appointments"
ON public.appointments FOR ALL
USING (auth.uid() = mentor_id);

-- Verify
SELECT schemaname, tablename, policyname, cmd 
FROM pg_policies 
ORDER BY tablename, cmd;
