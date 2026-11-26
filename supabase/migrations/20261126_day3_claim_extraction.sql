-- ============================================================================
-- TruthLens AI — Day 3: Gemini Intelligent Claim Extraction Migration
-- Idempotent migration to add structured claim extraction columns, indexes,
-- and RLS policies for re-analysis and report generation.
-- ============================================================================

-- 1. Add structured extraction columns to claims
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS normalized_text text,
  ADD COLUMN IF NOT EXISTS is_verifiable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS claim_type text NOT NULL DEFAULT 'Verifiable factual claim',
  ADD COLUMN IF NOT EXISTS entities text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS date text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS context text,
  ADD COLUMN IF NOT EXISTS search_queries text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Indexes for fast claim retrieval & category filtering
CREATE INDEX IF NOT EXISTS idx_claims_is_verifiable ON public.claims(is_verifiable);
CREATE INDEX IF NOT EXISTS idx_claims_category ON public.claims(category);
CREATE INDEX IF NOT EXISTS idx_claims_claim_type ON public.claims(claim_type);

-- 3. RLS: Allow submission owners to delete/replace claims on re-analysis
DROP POLICY IF EXISTS "Admins delete claims" ON public.claims;
DROP POLICY IF EXISTS "Users delete claims for own submissions or admin deletes any" ON public.claims;
CREATE POLICY "Users delete claims for own submissions or admin deletes any"
  ON public.claims FOR DELETE
  TO authenticated
  USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = claims.submission_id AND s.user_id = auth.uid()
    )
  );

-- 4. RLS: Allow submission owners to generate AI analysis reports
DROP POLICY IF EXISTS "Admins create reports" ON public.reports;
DROP POLICY IF EXISTS "Users insert reports for own submissions or admin inserts any" ON public.reports;
CREATE POLICY "Users insert reports for own submissions or admin inserts any"
  ON public.reports FOR INSERT
  TO authenticated
  WITH CHECK (
    (author_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = reports.submission_id AND s.user_id = auth.uid()
    ))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Users update reports for own submissions or admin updates any" ON public.reports;
CREATE POLICY "Users update reports for own submissions or admin updates any"
  ON public.reports FOR UPDATE
  TO authenticated
  USING (
    (author_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = reports.submission_id AND s.user_id = auth.uid()
    ))
    OR public.is_admin()
  );

-- 5. Submission status transition rule for analysis
-- Allow transition to 'in_review' or 'extracted' upon AI analysis,
-- while still strictly preventing non-admins from setting 'completed'
-- (which is exclusively reserved for human editorial verdicts).
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

  -- Block changing ownership
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Users cannot transfer submission ownership.';
  END IF;

  -- Block non-admin setting final completed status
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Only administrators can mark submissions as completed.';
  END IF;

  RETURN NEW;
END;
$$;
