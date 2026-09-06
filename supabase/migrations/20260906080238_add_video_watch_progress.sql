-- Per-user video playback progress (Continue Watching / resume playback)
-- One row per (user, video): last playback position, duration at save time, completed flag.

CREATE TABLE IF NOT EXISTS public.video_watch_progress (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  position_secs numeric(10,2) NOT NULL DEFAULT 0 CHECK (position_secs >= 0),
  duration_secs numeric(10,2),
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

ALTER TABLE public.video_watch_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own video watch progress" ON public.video_watch_progress;
CREATE POLICY "Users manage own video watch progress"
ON public.video_watch_progress FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_video_watch_progress_user_updated
ON public.video_watch_progress (user_id, updated_at DESC);
