-- User Approval System Migration
-- This migration adds approval workflow for new user registrations

-- 1. Add status column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN status text NOT NULL DEFAULT 'pending'
CHECK (status IN ('pending', 'approved', 'rejected'));

-- Add comment for clarity
COMMENT ON COLUMN public.profiles.status IS 'Account approval status: pending, approved, rejected';

-- Create index for faster status queries
CREATE INDEX idx_profiles_status ON public.profiles(status);

-- 2. Create user_approval_requests table
CREATE TABLE public.user_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Enable RLS on user_approval_requests
ALTER TABLE public.user_approval_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own approval requests
CREATE POLICY "Users can view own approval requests"
ON public.user_approval_requests FOR SELECT
USING (auth.uid() = user_id);

-- Admins can view all approval requests
CREATE POLICY "Admins can view all approval requests"
ON public.user_approval_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Admins can update approval requests (approve/reject)
CREATE POLICY "Admins can update approval requests"
ON public.user_approval_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Service role can insert approval requests (via trigger)
CREATE POLICY "Service role can insert approval requests"
ON public.user_approval_requests FOR INSERT
WITH CHECK (true);

-- 4. Update handle_new_user() trigger to set pending status and create approval request
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- 5. Create approve_user() function for admin to approve/reject users
CREATE OR REPLACE FUNCTION public.approve_user(
  target_user_id uuid,
  approved boolean,
  admin_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  admin_id uuid;
  new_status text;
BEGIN
  -- Get current admin ID (check role only, not status - admins bypass approval)
  SELECT id INTO admin_id 
  FROM public.profiles 
  WHERE id = auth.uid() AND role = 'admin';
  
  -- Check if user is admin
  IF admin_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: Admin access required');
  END IF;
  
  -- Determine new status
  IF approved THEN
    new_status := 'approved';
  ELSE
    new_status := 'rejected';
  END IF;
  
  -- Update user profile status
  UPDATE public.profiles 
  SET status = new_status
  WHERE id = target_user_id;
  
  -- Update approval request
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

-- 6. Update RLS policies to block unapproved users

-- Profiles: Users can always read their own profile (needed to check approval status)
-- Other profile access is controlled by other policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Approved users can view other profiles" ON public.profiles;
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Appointments: Only approved students can create
DROP POLICY IF EXISTS "Students can create appointments" ON public.appointments;
CREATE POLICY "Approved students can create appointments"
ON public.appointments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'student' AND status = 'approved'
  )
);

-- Group Sessions: Only approved users can view
DROP POLICY IF EXISTS "Public view" ON public.group_sessions;
CREATE POLICY "Approved users can view sessions"
ON public.group_sessions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND status = 'approved'
  )
);

-- Videos: Only approved users can view
DROP POLICY IF EXISTS "Allow authenticated users to read videos" ON public.videos;
CREATE POLICY "Approved users can view videos"
ON public.videos FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND status = 'approved'
  )
);

-- Session Participants: Only approved users can join
DROP POLICY IF EXISTS "User view/insert" ON public.session_participants;
CREATE POLICY "Approved users can view/insert session participants"
ON public.session_participants FOR ALL
USING (
  auth.uid() = user_id
  OR
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND status = 'approved'
  )
);

-- Session Chats: Only approved users can view
DROP POLICY IF EXISTS "Public view" ON public.session_chats;
CREATE POLICY "Approved users can view session chats"
ON public.session_chats FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND status = 'approved'
  )
);

-- Meeting Logs: Only approved users can view
DROP POLICY IF EXISTS "Mentor view" ON public.meeting_logs;
CREATE POLICY "Approved mentors can view meeting logs"
ON public.meeting_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'mentor' AND status = 'approved'
  )
);

-- Session Recordings: Only approved users can view
DROP POLICY IF EXISTS "Mentors can view their session recordings" ON public.session_recordings;
CREATE POLICY "Approved mentors can view session recordings"
ON public.session_recordings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'mentor' AND status = 'approved'
  )
);

-- Admins can view all recordings
DROP POLICY IF EXISTS "Admins can view all recordings" ON public.session_recordings;
CREATE POLICY "Approved admins can view all recordings"
ON public.session_recordings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin' AND status = 'approved'
  )
);
