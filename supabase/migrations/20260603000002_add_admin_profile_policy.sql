-- Add admin SELECT policy on profiles so admins can read all user profiles
-- This is needed for the admin User Approval panel which joins profiles via user_approval_requests

--this policy creates a infinite loop, due to which admin account is also showing pending and not able to login

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);
