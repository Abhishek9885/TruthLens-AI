"use client";

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SubmissionWorkspace } from "@/components/submissions/submission-workspace";
import { SubmissionsList } from "@/components/submissions/submissions-list";
import type {
  ReviewDecision,
  Submission,
  UserRole,
} from "@/types/database";

export default function SubmitPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [userRole, setUserRole] = useState<UserRole>("user");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/submissions?scope=${scope}`)
      .then(async (response) => {
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setLoadError(data.error ?? "Failed to load submissions.");
          return;
        }
        setLoadError(null);
        setSubmissions(data.submissions ?? []);
        if (data.role === "admin" || data.role === "user") {
          setUserRole(data.role);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Unable to load submissions right now.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [scope]);

  const handleScopeChange = (nextScope: "mine" | "all") => {
    setLoading(true);
    setScope(nextScope);
  };

  const handleSubmitted = (created: Submission) => {
    setSubmissions((prev) => [created, ...prev]);
  };

  const handleDelete = async (id: string) => {
    const response = await fetch(`/api/submissions/${id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      setSubmissions((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const handleAdminReview = async (
    id: string,
    decision: ReviewDecision,
    notes?: string
  ): Promise<string | null> => {
    try {
      const response = await fetch(`/api/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          notes: notes && notes.trim().length > 0 ? notes.trim() : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        return data.error ?? "Failed to save review.";
      }
      setSubmissions((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status: data.submission.status,
                latest_review: data.review,
                ai_assessment:
                  data.submission.ai_assessment ?? item.ai_assessment,
              }
            : item
        )
      );
      return null;
    } catch {
      return "Network error while saving review decision.";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Submit Content
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ingest election-related URLs, manual claims, or screenshots with
            automatic extraction and OCR.
          </p>
        </div>

        <Badge
          variant="outline"
          className="w-fit gap-1.5 border-blue-accent/40 bg-blue-accent/10 text-blue-glow"
        >
          <Shield className="h-3.5 w-3.5" />
          Role: {userRole === "admin" ? "Administrator" : "User"}
        </Badge>
      </div>

      <SubmissionWorkspace onSubmitted={handleSubmitted} />

      {loadError && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
          {loadError} (Make sure you have executed `supabase/schema.sql` in your
          Supabase SQL Editor.)
        </div>
      )}

      <SubmissionsList
        submissions={submissions}
        userRole={userRole}
        scope={scope}
        onScopeChange={handleScopeChange}
        onDelete={handleDelete}
        onAdminReview={handleAdminReview}
        loading={loading}
      />
    </div>
  );
}
