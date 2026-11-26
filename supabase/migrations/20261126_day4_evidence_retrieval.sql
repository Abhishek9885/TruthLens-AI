-- ============================================================================
-- TruthLens AI: Day 4 Migration — Evidence Retrieval & Fact-Check Normalization
-- ============================================================================
-- Extends public.evidence table with fields required for Google Fact Check Tools API
-- integration, structured publisher metadata, evidence classification, and deduplication.

ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'fact_check',
  ADD COLUMN IF NOT EXISTS evidence_type text NOT NULL DEFAULT 'unclassified',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS original_rating text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS retrieved_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS relevance_explanation text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Indexes for performance & deduplication
CREATE INDEX IF NOT EXISTS idx_evidence_source_type ON public.evidence(source_type);
CREATE INDEX IF NOT EXISTS idx_evidence_evidence_type ON public.evidence(evidence_type);
CREATE INDEX IF NOT EXISTS idx_evidence_retrieved_at ON public.evidence(retrieved_at);

-- Deduplication index: Prevents saving the exact same source URL for the same claim
CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_claim_source_url 
  ON public.evidence(claim_id, source_url) 
  WHERE source_url IS NOT NULL;

-- Allow users to delete/update evidence on claims belonging to their own submissions
-- (needed for fresh evidence re-retrieval and deduplication)
DROP POLICY IF EXISTS "Users delete evidence for own submissions or admin deletes any" ON public.evidence;
CREATE POLICY "Users delete evidence for own submissions or admin deletes any"
  ON public.evidence FOR DELETE
  TO authenticated
  USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.claims c
      JOIN public.submissions s ON s.id = c.submission_id
      WHERE c.id = evidence.claim_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users update evidence for own submissions or admin updates any" ON public.evidence;
CREATE POLICY "Users update evidence for own submissions or admin updates any"
  ON public.evidence FOR UPDATE
  TO authenticated
  USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.claims c
      JOIN public.submissions s ON s.id = c.submission_id
      WHERE c.id = evidence.claim_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.claims c
      JOIN public.submissions s ON s.id = c.submission_id
      WHERE c.id = evidence.claim_id AND s.user_id = auth.uid()
    )
  );
