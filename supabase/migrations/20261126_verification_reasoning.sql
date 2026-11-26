-- ============================================================================
-- TruthLens AI: Verification Reasoning & Report Persistence Migration
-- ============================================================================
-- Adds AI preliminary verdict, confidence, transparent reasoning, citations,
-- limitations, and separate human review fields to public.claims and public.reports.

-- 1. Claims Table Extensions
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS ai_verdict text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS ai_confidence numeric(5,2),
  ADD COLUMN IF NOT EXISTS ai_explanation text,
  ADD COLUMN IF NOT EXISTS ai_reasoning text,
  ADD COLUMN IF NOT EXISTS ai_structured_result jsonb,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS human_verdict text,
  ADD COLUMN IF NOT EXISTS human_explanation text,
  ADD COLUMN IF NOT EXISTS human_reviewer_id uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_claims_ai_verdict ON public.claims(ai_verdict);
CREATE INDEX IF NOT EXISTS idx_claims_verified_at ON public.claims(verified_at);

-- 2. Reports Table Extensions
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS findings jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS overall_stats jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS limitations text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS ai_model text;

-- 3. Reports RLS Policy for Owners to update reports on re-verification
DROP POLICY IF EXISTS "Users update own submission reports or admin updates any" ON public.reports;
CREATE POLICY "Users update own submission reports or admin updates any"
  ON public.reports FOR UPDATE
  TO authenticated
  USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = reports.submission_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = reports.submission_id AND s.user_id = auth.uid()
    )
  );
