-- Diagnostic script to check user approval system status
-- Run this in Supabase SQL Editor to diagnose issues

-- 1. Check if status column exists in profiles
SELECT 
  column_name, 
  data_type, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name = 'status';

-- 2. Check if user_approval_requests table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'user_approval_requests'
) as table_exists;

-- 3. Check all users and their status
SELECT 
  id, 
  email, 
  full_name, 
  role, 
  status,
  created_at
FROM profiles
ORDER BY created_at DESC;

-- 4. Check pending approval requests
SELECT 
  id,
  user_id,
  status,
  requested_at,
  reviewed_at
FROM user_approval_requests
WHERE status = 'pending'
ORDER BY requested_at;

-- 5. Check RLS policies on profiles table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'profiles';

-- 6. Quick fix: Update all admins to approved status (if status column exists)
-- Uncomment and run this if needed:
-- UPDATE profiles SET status = 'approved' WHERE role = 'admin';

-- 7. Quick fix: Create profile for users who don't have one
-- Uncomment and run this if needed:
-- INSERT INTO profiles (id, email, full_name, role, status)
-- SELECT 
--   au.id,
--   au.email,
--   COALESCE(au.raw_user_meta_data->>'full_name', au.email),
--   COALESCE(au.raw_user_meta_data->>'role', 'student'),
--   'approved'
-- FROM auth.users au
-- LEFT JOIN profiles p ON au.id = p.id
-- WHERE p.id IS NULL;
