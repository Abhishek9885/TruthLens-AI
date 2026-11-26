-- ============================================================================
-- TruthLens AI — Supabase Database Schema, Roles, Triggers & Row Level Security
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PROFILES
-- Extends Supabase auth.users with application metadata and RBAC role.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. SUBMISSIONS
-- Stores URL, manual text, and image submissions with extracted content.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submission_type text NOT NULL CHECK (submission_type IN ('url', 'text', 'image')),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'extracted', 'in_review', 'completed', 'failed')
  ),
  title text,
  source_url text,
  raw_text text,
  extracted_text text,
  extraction_status text NOT NULL DEFAULT 'not_applicable' CHECK (
    extraction_status IN ('not_applicable', 'success', 'partial', 'failed')
  ),
  extraction_error text,
  image_path text,
  image_mime_type text,
  image_size_bytes bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submissions_type_payload_check CHECK (
    (submission_type = 'url' AND source_url IS NOT NULL AND char_length(trim(source_url)) > 0) OR
    (submission_type = 'text' AND raw_text IS NOT NULL AND char_length(trim(raw_text)) > 0) OR
    (submission_type = 'image' AND image_path IS NOT NULL AND char_length(trim(image_path)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON public.submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_created ON public.submissions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON public.submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_type ON public.submissions(submission_type);

-- ============================================================================
-- 3. CLAIMS
-- Individual factual claims extracted or submitted from a submission.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  claim_text text NOT NULL,
  category text DEFAULT 'general',
  verdict text NOT NULL DEFAULT 'unverified' CHECK (
    verdict IN ('unverified', 'verified_true', 'misleading', 'false', 'unverifiable')
  ),
  confidence_score numeric(5,2) CHECK (confidence_score >= 0 AND confidence_score <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claims_submission_id ON public.claims(submission_id);
CREATE INDEX IF NOT EXISTS idx_claims_created_by ON public.claims(created_by);
CREATE INDEX IF NOT EXISTS idx_claims_verdict ON public.claims(verdict);

-- ============================================================================
-- 4. EVIDENCE
-- Primary sources, citations, and documentation linked to a claim.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  added_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_title text NOT NULL,
  source_url text,
  excerpt text,
  stance text NOT NULL DEFAULT 'neutral' CHECK (
    stance IN ('supporting', 'refuting', 'neutral')
  ),
  credibility_rating integer CHECK (credibility_rating >= 1 AND credibility_rating <= 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_claim_id ON public.evidence(claim_id);
CREATE INDEX IF NOT EXISTS idx_evidence_added_by ON public.evidence(added_by);

-- ============================================================================
-- 5. REPORTS
-- Verification reports summarizing findings for a submission.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  summary text NOT NULL,
  methodology text,
  overall_verdict text NOT NULL DEFAULT 'unverified' CHECK (
    overall_verdict IN ('unverified', 'verified_true', 'misleading', 'false', 'unverifiable')
  ),
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_submission_id ON public.reports(submission_id);
CREATE INDEX IF NOT EXISTS idx_reports_author_id ON public.reports(author_id);

-- ============================================================================
-- 6. REVIEWS
-- Analyst / Admin editorial moderation & review decisions on submissions.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (
    decision IN ('approved', 'flagged', 'rejected', 'needs_more_evidence')
  ),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_submission_id ON public.reviews(submission_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id ON public.reviews(reviewer_id);

-- ============================================================================
-- 7. AUDIT LOGS
-- Immutable security & activity trail for compliance and forensics.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ============================================================================
-- HELPER FUNCTIONS & TRIGGERS
-- ============================================================================

-- Automatic updated_at timestamp helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_submissions_updated_at ON public.submissions;
CREATE TRIGGER trg_submissions_updated_at
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_claims_updated_at ON public.claims;
CREATE TRIGGER trg_claims_updated_at
  BEFORE UPDATE ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_reports_updated_at ON public.reports;
CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_reviews_updated_at ON public.reviews;
CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper function to check if current user is an admin (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

-- Automatically create a profile row when a new auth user signs up.
-- Always enforces role = 'user' on signup regardless of client metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Prevent non-admin users from escalating their own role via profile updates,
-- while still allowing Supabase SQL Editor (postgres, no JWT) and service_role.
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

-- Protect submission workflow status, ownership, and AI assessment metadata
-- from modification by non-admin users.
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

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- --- PROFILES POLICIES ---
DROP POLICY IF EXISTS "Users can view own profile or admin views all" ON public.profiles;
CREATE POLICY "Users can view own profile or admin views all"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid() AND role = 'user');

DROP POLICY IF EXISTS "Users can update own profile or admin updates any" ON public.profiles;
CREATE POLICY "Users can update own profile or admin updates any"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- --- SUBMISSIONS POLICIES ---
DROP POLICY IF EXISTS "Users view own submissions or admin views all" ON public.submissions;
CREATE POLICY "Users view own submissions or admin views all"
  ON public.submissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users create own submissions" ON public.submissions;
CREATE POLICY "Users create own submissions"
  ON public.submissions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own submissions or admin updates any" ON public.submissions;
DROP POLICY IF EXISTS "Admins update submissions" ON public.submissions;
CREATE POLICY "Admins update submissions"
  ON public.submissions FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users delete own submissions or admin deletes any" ON public.submissions;
CREATE POLICY "Users delete own submissions or admin deletes any"
  ON public.submissions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- --- CLAIMS POLICIES ---
DROP POLICY IF EXISTS "Users view claims for own submissions or admin views all" ON public.claims;
CREATE POLICY "Users view claims for own submissions or admin views all"
  ON public.claims FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = claims.submission_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users insert claims for own submissions or admin inserts any" ON public.claims;
CREATE POLICY "Users insert claims for own submissions or admin inserts any"
  ON public.claims FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      public.is_admin() OR
      EXISTS (
        SELECT 1 FROM public.submissions s
        WHERE s.id = claims.submission_id AND s.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Admins update or delete claims" ON public.claims;
CREATE POLICY "Admins update or delete claims"
  ON public.claims FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete claims" ON public.claims;
CREATE POLICY "Admins delete claims"
  ON public.claims FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- --- EVIDENCE POLICIES ---
DROP POLICY IF EXISTS "Users view evidence for own submissions or admin views all" ON public.evidence;
CREATE POLICY "Users view evidence for own submissions or admin views all"
  ON public.evidence FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.claims c
      JOIN public.submissions s ON s.id = c.submission_id
      WHERE c.id = evidence.claim_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users add evidence for own submissions or admin adds any" ON public.evidence;
CREATE POLICY "Users add evidence for own submissions or admin adds any"
  ON public.evidence FOR INSERT
  TO authenticated
  WITH CHECK (
    added_by = auth.uid() AND (
      public.is_admin() OR
      EXISTS (
        SELECT 1 FROM public.claims c
        JOIN public.submissions s ON s.id = c.submission_id
        WHERE c.id = evidence.claim_id AND s.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Admins manage evidence" ON public.evidence;
CREATE POLICY "Admins manage evidence"
  ON public.evidence FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- --- REPORTS POLICIES ---
DROP POLICY IF EXISTS "Users view own submission reports or published reports" ON public.reports;
CREATE POLICY "Users view own submission reports or published reports"
  ON public.reports FOR SELECT
  TO authenticated
  USING (
    is_published = true OR
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = reports.submission_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins create reports" ON public.reports;
CREATE POLICY "Admins create reports"
  ON public.reports FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() AND author_id = auth.uid());

DROP POLICY IF EXISTS "Admins update reports" ON public.reports;
CREATE POLICY "Admins update reports"
  ON public.reports FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete reports" ON public.reports;
CREATE POLICY "Admins delete reports"
  ON public.reports FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- --- REVIEWS POLICIES ---
DROP POLICY IF EXISTS "Users view reviews on own submissions or admin views all" ON public.reviews;
CREATE POLICY "Users view reviews on own submissions or admin views all"
  ON public.reviews FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = reviews.submission_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins create reviews" ON public.reviews;
CREATE POLICY "Admins create reviews"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() AND reviewer_id = auth.uid());

DROP POLICY IF EXISTS "Admins update reviews" ON public.reviews;
CREATE POLICY "Admins update reviews"
  ON public.reviews FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete reviews" ON public.reviews;
CREATE POLICY "Admins delete reviews"
  ON public.reviews FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- --- AUDIT LOGS POLICIES ---
DROP POLICY IF EXISTS "Users view own audit logs or admin views all" ON public.audit_logs;
CREATE POLICY "Users view own audit logs or admin views all"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (actor_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Authenticated users insert own audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users insert own audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- ============================================================================
-- ADMIN PROMOTION
-- To promote a user to admin, use their auth.users UUID (never trust email):
--
--   UPDATE public.profiles SET role = 'admin' WHERE id = '<AUTH_USER_UUID>';
--
-- You can find the UUID in the Supabase Dashboard under Authentication > Users.
-- This must be run by a user who is already an admin, or in the SQL Editor
-- with the service role (which bypasses RLS).
-- ============================================================================

-- ============================================================================
-- STORAGE BUCKET & POLICIES (for preserved submission images)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'submission-images',
  'submission-images',
  false,
  5242880, -- 5 MB max
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
