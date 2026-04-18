/**
 * Shared types for the Site Doctor report.
 *
 * Used by:
 *   - src/app/api/doctor/trigger/route.ts
 *   - src/lib/inngest/doctor.ts
 *   - src/lib/email/templates.ts (doctorReportEmail)
 */

export type IssueType =
  | "missing_transcript"
  | "missing_references"
  | "stale_pipeline"
  | "service_down"
  | "page_error"
  | "expired_media"
  | "oversized_video"
  | "transcript_error"
  | "references_ai_error"
  | "config"
  | "db_error"
  | "unexpected_error";

export type FixType =
  | "missing_transcript"
  | "missing_references"
  | "stale_pipelines"
  | "service_restart";

export interface DoctorIssue {
  type: IssueType;
  siteSlug?: string;
  shortcode?: string;
  detail: string;
}

export interface DoctorFix {
  type: FixType;
  success: boolean;
  detail: string;
}

export interface DoctorFlagged {
  type: string;
  siteSlug?: string;
  shortcode?: string;
  detail: string;
}

export interface DoctorReport {
  startedAt: string;
  completedAt: string | null;
  sitesInspected: number;
  issues: DoctorIssue[];
  fixes: DoctorFix[];
  flagged: DoctorFlagged[];
}
