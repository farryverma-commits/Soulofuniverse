-- Host Cancel/Delete for group_sessions.
--
-- Cancel: host sets status='cancelled' (via livekit-manage-session edge fn,
-- service role). Cancelled rows vanish from every student surface (all student
-- queries filter status IN ('scheduled','live')) but stay visible to the host.
-- Delete: hard DELETE of accidental creates (scheduled/cancelled only, never
-- live). Children (session_participants, session_chats, meeting_logs,
-- session_recordings) already CASCADE.
--
-- Direct-table DELETE policy for the mentor-owns row case. Admin deletes go
-- through the edge function (service role), not direct table writes.

-- Mentor can hard-delete their own non-live sessions (accidental creates).
-- The existing "Mentors update own sessions" policy already permits
-- status->'cancelled', so no new UPDATE policy is needed.
DROP POLICY IF EXISTS "Mentors delete own sessions" ON public.group_sessions;
CREATE POLICY "Mentors delete own sessions"
  ON public.group_sessions
  FOR DELETE
  USING (auth.uid() = mentor_id);
