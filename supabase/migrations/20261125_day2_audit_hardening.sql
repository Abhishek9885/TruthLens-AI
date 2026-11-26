-- ============================================================================
-- TruthLens AI — Day 2 Audit Hardening Migration
-- Run this idempotent script in Supabase SQL Editor if you already executed
-- the initial schema.sql earlier.
-- ============================================================================

-- 1. Additional performance indexes on foreign keys and query filters
CREATE INDEX IF NOT EXISTS idx_submissions_user_created ON public.submissions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_type ON public.submissions(submission_type);
CREATE INDEX IF NOT EXISTS idx_claims_created_by ON public.claims(created_by);
CREATE INDEX IF NOT EXISTS idx_evidence_added_by ON public.evidence(added_by);
CREATE INDEX IF NOT EXISTS idx_reports_author_id ON public.reports(author_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id ON public.reviews(reviewer_id);

-- 2. Fix prevent_role_self_escalation() so SQL Editor (no JWT) and service_role
--    can promote initial admins using their auth.users UUID, while blocking
--    authenticated non-admin users from escalating their own role.
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text := NULLIF(auth.role(), '');
BEGIN
  IF jwt_role IS NULL OR jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can change user roles.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_self_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_self_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_escalation();

-- 3. Restrict direct submission updates to administrators & protect AI/moderation fields
CREATE OR REPLACE FUNCTION public.protect_submission_moderation_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text := NULLIF(auth.role(), '');
BEGIN
  IF jwt_role IS NULL OR jwt_role = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR (NEW.metadata->'ai_assessment') IS DISTINCT FROM (OLD.metadata->'ai_assessment') THEN
    RAISE EXCEPTION 'Only administrators can modify submission moderation status or AI assessment data.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_submission_moderation_fields ON public.submissions;
CREATE TRIGGER trg_protect_submission_moderation_fields
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.protect_submission_moderation_fields();

DROP POLICY IF EXISTS "Users update own submissions or admin updates any" ON public.submissions;
DROP POLICY IF EXISTS "Admins update submissions" ON public.submissions;
CREATE POLICY "Admins update submissions"
  ON public.submissions FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. Ensure private storage bucket and storage RLS policies exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'submission-images',
  'submission-images',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users upload images into own folder" ON storage.objects;
CREATE POLICY "Users upload images into own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'submission-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users read own images or admin reads all" ON storage.objects;
CREATE POLICY "Users read own images or admin reads all"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'submission-images' AND
    ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin())
  );

DROP POLICY IF EXISTS "Users delete own images or admin deletes any" ON storage.objects;
CREATE POLICY "Users delete own images or admin deletes any"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'submission-images' AND
    ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin())
  );

-- ============================================================================
-- Promote a user to admin using their auth.users UUID (never rely on email):
--   UPDATE public.profiles SET role = 'admin' WHERE id = '<AUTH_USER_UUID>';
-- ============================================================================
