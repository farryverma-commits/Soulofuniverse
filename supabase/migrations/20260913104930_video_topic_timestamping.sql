-- Video timestamping + topic search + review-to-publish lifecycle.
--
-- Topics == tags: one concept, one master table (`topics`). Admin-authored
-- point marks live in `video_timestamps`; per-user search/play telemetry in
-- `topic_interactions`. `videos.status` gains the `under_review` gate so only
-- admin-published videos reach the library.
--
-- Idempotent: every statement is guarded (IF NOT EXISTS / DROP IF EXISTS /
-- conditional backfill), so the file is safe to re-run and to `db push`
-- after a manual apply.

-- ---------------------------------------------------------------------------
-- 1. topics master table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT topics_name_length CHECK (char_length(name) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_topics_lower_name ON public.topics (lower(name));
CREATE INDEX IF NOT EXISTS idx_topics_created_at ON public.topics (created_at DESC);

ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.topics TO authenticated;

DROP POLICY IF EXISTS "Approved users can view topics via JWT" ON public.topics;
CREATE POLICY "Approved users can view topics via JWT"
  ON public.topics FOR SELECT
  USING ((auth.jwt() #>> '{app_metadata,user_status}') = 'approved');

DROP POLICY IF EXISTS "Admins manage topics via JWT" ON public.topics;
CREATE POLICY "Admins manage topics via JWT"
  ON public.topics FOR ALL
  USING (
    (auth.jwt() #>> '{app_metadata,user_role}') = 'admin'
    AND (auth.jwt() #>> '{app_metadata,user_status}') = 'approved'
  )
  WITH CHECK (
    (auth.jwt() #>> '{app_metadata,user_role}') = 'admin'
    AND (auth.jwt() #>> '{app_metadata,user_status}') = 'approved'
  );

-- ---------------------------------------------------------------------------
-- 2. video_timestamps: admin-authored point marks (video, topic, second)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_timestamps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE RESTRICT,
  timestamp_secs numeric(10,2) NOT NULL CONSTRAINT video_timestamps_secs_nonneg CHECK (timestamp_secs >= 0),
  note text NULL CONSTRAINT video_timestamps_note_length CHECK (note IS NULL OR char_length(note) <= 280),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_timestamps_no_dupe UNIQUE (video_id, topic_id, timestamp_secs)
);

CREATE INDEX IF NOT EXISTS idx_video_timestamps_video_time ON public.video_timestamps (video_id, timestamp_secs);
CREATE INDEX IF NOT EXISTS idx_video_timestamps_topic ON public.video_timestamps (topic_id);

ALTER TABLE public.video_timestamps ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_timestamps TO authenticated;

DROP POLICY IF EXISTS "Approved users can view video timestamps via JWT" ON public.video_timestamps;
CREATE POLICY "Approved users can view video timestamps via JWT"
  ON public.video_timestamps FOR SELECT
  USING ((auth.jwt() #>> '{app_metadata,user_status}') = 'approved');

DROP POLICY IF EXISTS "Admins manage video timestamps via JWT" ON public.video_timestamps;
CREATE POLICY "Admins manage video timestamps via JWT"
  ON public.video_timestamps FOR ALL
  USING (
    (auth.jwt() #>> '{app_metadata,user_role}') = 'admin'
    AND (auth.jwt() #>> '{app_metadata,user_status}') = 'approved'
  )
  WITH CHECK (
    (auth.jwt() #>> '{app_metadata,user_role}') = 'admin'
    AND (auth.jwt() #>> '{app_metadata,user_status}') = 'approved'
  );

-- ---------------------------------------------------------------------------
-- 3. topic_interactions: per-user search/play telemetry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.topic_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  video_id uuid NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  type text NOT NULL CONSTRAINT topic_interactions_type_check CHECK (type IN ('search', 'play')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topic_interactions_user_topic ON public.topic_interactions (user_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_interactions_topic_created ON public.topic_interactions (topic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topic_interactions_user_created ON public.topic_interactions (user_id, created_at DESC);

ALTER TABLE public.topic_interactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_interactions TO authenticated;

DROP POLICY IF EXISTS "Users manage own topic interactions" ON public.topic_interactions;
CREATE POLICY "Users manage own topic interactions"
  ON public.topic_interactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all topic interactions via JWT" ON public.topic_interactions;
CREATE POLICY "Admins can view all topic interactions via JWT"
  ON public.topic_interactions FOR SELECT
  USING (
    (auth.jwt() #>> '{app_metadata,user_role}') = 'admin'
    AND (auth.jwt() #>> '{app_metadata,user_status}') = 'approved'
  );

-- ---------------------------------------------------------------------------
-- 4. videos review-to-publish lifecycle
--
-- Backfill first (idempotent): live `ready` rows -> `published` so the
-- current library stays visible; anything outside the canonical set ->
-- `under_review` for admin triage. From here on the engine writes
-- `under_review`, never `ready`.
-- ---------------------------------------------------------------------------
UPDATE public.videos SET status = 'published' WHERE status = 'ready';
UPDATE public.videos
  SET status = 'under_review'
  WHERE status NOT IN ('processing', 'under_review', 'published', 'failed');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'videos_status_check') THEN
    ALTER TABLE public.videos
      ADD CONSTRAINT videos_status_check
      CHECK (status IN ('processing', 'under_review', 'published', 'failed'));
  END IF;
END
$$;

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

-- Replace the permissive SELECT policies (legacy EXISTS + unfiltered JWT)
-- with a single published-gated JWT policy. Admins see all statuses so the
-- review queue and timestamp editor can read non-published rows.
DROP POLICY IF EXISTS "Approved users can view videos" ON public.videos;
DROP POLICY IF EXISTS "Approved users can view videos via JWT" ON public.videos;
CREATE POLICY "Approved users can view published videos via JWT"
  ON public.videos FOR SELECT
  USING (
    (auth.jwt() #>> '{app_metadata,user_status}') = 'approved'
    AND (
      status = 'published'
      OR (auth.jwt() #>> '{app_metadata,user_role}') = 'admin'
    )
  );

-- Admin publish/unpublish. UPDATE also reads through the SELECT policy
-- above, which already covers admins.
DROP POLICY IF EXISTS "Admins can update video status via JWT" ON public.videos;
CREATE POLICY "Admins can update video status via JWT"
  ON public.videos FOR UPDATE
  USING (
    (auth.jwt() #>> '{app_metadata,user_role}') = 'admin'
    AND (auth.jwt() #>> '{app_metadata,user_status}') = 'approved'
  )
  WITH CHECK (
    (auth.jwt() #>> '{app_metadata,user_role}') = 'admin'
    AND (auth.jwt() #>> '{app_metadata,user_status}') = 'approved'
  );
