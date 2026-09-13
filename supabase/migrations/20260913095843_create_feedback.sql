-- User-submitted queries and feature feedback. Simple write-once store:
-- users insert their own rows, admins read all and flip status to reviewed.

CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'question'
    CHECK (category IN ('question', 'problem', 'idea', 'other')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.feedback TO authenticated;

DROP POLICY IF EXISTS "Users insert own feedback" ON public.feedback;
CREATE POLICY "Users insert own feedback"
ON public.feedback FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own feedback" ON public.feedback;
CREATE POLICY "Users view own feedback"
ON public.feedback FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all feedback" ON public.feedback;
CREATE POLICY "Admins view all feedback"
ON public.feedback FOR SELECT
USING (
  (auth.jwt() #>> '{app_metadata,user_role}') = 'admin'
  AND (auth.jwt() #>> '{app_metadata,user_status}') = 'approved'
);

DROP POLICY IF EXISTS "Admins mark feedback reviewed" ON public.feedback;
CREATE POLICY "Admins mark feedback reviewed"
ON public.feedback FOR UPDATE
USING (
  (auth.jwt() #>> '{app_metadata,user_role}') = 'admin'
  AND (auth.jwt() #>> '{app_metadata,user_status}') = 'approved'
)
WITH CHECK (
  (auth.jwt() #>> '{app_metadata,user_role}') = 'admin'
  AND (auth.jwt() #>> '{app_metadata,user_status}') = 'approved'
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at
ON public.feedback (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id
ON public.feedback (user_id);
