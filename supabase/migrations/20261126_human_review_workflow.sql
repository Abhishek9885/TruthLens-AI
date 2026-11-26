-- ============================================================================
-- TruthLens AI — Day 6 Migration: Human Review Workflow & Editorial Moderation
-- Enables multi-decision review lifecycle, audit logging, and human verdict separation.
-- ============================================================================

-- 1. Extend submissions status check constraint to include review workflow states
ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_status_check;
ALTER TABLE public.submissions ADD CONSTRAINT submissions_status_check CHECK (
  status IN (
    'pending',
    'extracted',
    'in_review',
    'pending_review',
    'under_review',
    'approved',
    'flagged',
    'needs_evidence',
    'rejected',
    'completed',
    'failed'
  )
);

-- 2. Extend reviews table with editorial metadata
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS previous_verdict text;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS final_verdict text;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS evidence_inspected boolean NOT NULL DEFAULT false;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS evidence_references jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS unresolved_issues text;

-- Update decision check constraint to support both 'needs_evidence' and legacy 'needs_more_evidence'
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_decision_check;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_decision_check CHECK (
  decision IN ('approved', 'flagged', 'rejected', 'needs_evidence', 'needs_more_evidence')
);

CREATE INDEX IF NOT EXISTS idx_reviews_report_id ON public.reviews(report_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_desc ON public.reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_sub_created ON public.reviews(submission_id, created_at DESC);

-- 3. Extend reports table with human review outcome fields
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS final_human_verdict text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS human_review_status text NOT NULL DEFAULT 'pending_review' CHECK (
  human_review_status IN ('pending_review', 'under_review', 'approved', 'flagged', 'needs_evidence', 'rejected')
);
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reviewer_notes text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reports_human_status ON public.reports(human_review_status);
CREATE INDEX IF NOT EXISTS idx_reports_reviewer_id ON public.reports(reviewer_id);

-- 4. Extend claims table for claim-level human adjudication
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS human_verdict text;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS human_explanation text;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS human_reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS human_reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_claims_human_verdict ON public.claims(human_verdict);

-- 5. Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_desc ON public.audit_logs(created_at DESC);

-- 6. Atomic RPC function for submitting human review decisions
CREATE OR REPLACE FUNCTION public.submit_human_review(
  p_submission_id uuid,
  p_report_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_final_verdict text,
  p_previous_verdict text,
  p_notes text,
  p_evidence_inspected boolean,
  p_evidence_references jsonb DEFAULT '[]'::jsonb,
  p_unresolved_issues text DEFAULT NULL,
  p_claim_verdicts jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_new_submission_status text;
  v_review_id uuid;
  v_claim_elem jsonb;
BEGIN
  -- Verify caller is admin
  SELECT (role = 'admin') INTO v_is_admin
  FROM public.profiles
  WHERE id = p_reviewer_id;

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Forbidden: Only administrators can submit human reviews.';
  END IF;

  -- Validate evidence inspection for approval
  IF p_decision = 'approved' AND NOT COALESCE(p_evidence_inspected, false) THEN
    RAISE EXCEPTION 'Invalid operation: Reviewers must inspect associated evidence before approving.';
  END IF;

  -- Map decision to submission status
  CASE p_decision
    WHEN 'approved' THEN v_new_submission_status := 'approved';
    WHEN 'flagged' THEN v_new_submission_status := 'flagged';
    WHEN 'needs_evidence' THEN v_new_submission_status := 'needs_evidence';
    WHEN 'rejected' THEN v_new_submission_status := 'rejected';
    ELSE v_new_submission_status := 'under_review';
  END CASE;

  -- 1. Insert immutable review entry into review history
  INSERT INTO public.reviews (
    submission_id,
    report_id,
    reviewer_id,
    decision,
    previous_verdict,
    final_verdict,
    notes,
    evidence_inspected,
    evidence_references,
    unresolved_issues,
    created_at
  ) VALUES (
    p_submission_id,
    p_report_id,
    p_reviewer_id,
    p_decision,
    p_previous_verdict,
    p_final_verdict,
    p_notes,
    p_evidence_inspected,
    COALESCE(p_evidence_references, '[]'::jsonb),
    p_unresolved_issues,
    now()
  )
  RETURNING id INTO v_review_id;

  -- 2. Update submission status
  UPDATE public.submissions
  SET status = v_new_submission_status,
      updated_at = now()
  WHERE id = p_submission_id;

  -- 3. Update report with human verdict and review outcome
  IF p_report_id IS NOT NULL THEN
    UPDATE public.reports
    SET final_human_verdict = p_final_verdict,
        human_review_status = p_decision,
        reviewer_notes = p_notes,
        reviewed_at = now(),
        reviewer_id = p_reviewer_id,
        updated_at = now()
    WHERE id = p_report_id;
  END IF;

  -- 4. Update claim-level human verdicts if provided
  IF p_claim_verdicts IS NOT NULL AND jsonb_array_length(p_claim_verdicts) > 0 THEN
    FOR v_claim_elem IN SELECT * FROM jsonb_array_elements(p_claim_verdicts)
    LOOP
      UPDATE public.claims
      SET human_verdict = v_claim_elem->>'human_verdict',
          human_explanation = v_claim_elem->>'human_explanation',
          human_reviewer_id = p_reviewer_id,
          human_reviewed_at = now(),
          updated_at = now()
      WHERE id = (v_claim_elem->>'claim_id')::uuid
        AND submission_id = p_submission_id;
    END LOOP;
  END IF;

  -- 5. Insert audit log record
  INSERT INTO public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    details,
    created_at
  ) VALUES (
    p_reviewer_id,
    'report_' || p_decision,
    'submission',
    p_submission_id,
    jsonb_build_object(
      'review_id', v_review_id,
      'report_id', p_report_id,
      'decision', p_decision,
      'previous_verdict', p_previous_verdict,
      'final_verdict', p_final_verdict,
      'notes', p_notes,
      'evidence_inspected', p_evidence_inspected
    ),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'review_id', v_review_id,
    'submission_status', v_new_submission_status,
    'final_verdict', p_final_verdict
  );
END;
$$;
