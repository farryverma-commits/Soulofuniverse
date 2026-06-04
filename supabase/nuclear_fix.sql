-- NUCLEAR FIX: Disable RLS on profiles, drop ALL policies, recreate clean

-- Step 1: Temporarily disable RLS to clear everything
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL profile policies safely
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname FROM pg_policies WHERE tablename = 'profiles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
        RAISE NOTICE 'Dropped: %', pol.policyname;
    END LOOP;
END $$;

-- Step 3: Re-enable RLS with only clean policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Step 4: Single policy - users read their own profile (no subquery!)
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- Step 5: Fix other tables that had recursive policies
ALTER TABLE public.appointments DISABLE ROW LEVEL SECURITY;
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'appointments' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.appointments', pol.policyname);
    END LOOP;
END $$;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Appointments access"
ON public.appointments FOR ALL
USING (auth.uid() = student_id OR auth.uid() = mentor_id);

-- Step 6: Fix group_sessions
ALTER TABLE public.group_sessions DISABLE ROW LEVEL SECURITY;
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'group_sessions' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.group_sessions', pol.policyname);
    END LOOP;
END $$;
ALTER TABLE public.group_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sessions visible to authenticated"
ON public.group_sessions FOR SELECT
USING (true);

CREATE POLICY "Mentors manage own sessions"
ON public.group_sessions FOR INSERT
WITH CHECK (auth.uid() = mentor_id);

CREATE POLICY "Mentors update own sessions"
ON public.group_sessions FOR UPDATE
USING (auth.uid() = mentor_id);

-- Step 7: Ensure admins are approved
UPDATE profiles SET status = 'approved' WHERE role = 'admin';

-- Step 8: Verify
SELECT tablename, policyname FROM pg_policies ORDER BY tablename;
