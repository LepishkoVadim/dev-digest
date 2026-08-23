import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
/**
 * How much of the PR's context we could actually resolve. DERIVED IN CODE from
 * which sources came back `used` — the model never reports its own confidence
 * (self-reported confidence tracks commitment, not correctness). An
 * `unavailable` source can never yield `high`.
 */
export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

/**
 * One input the intent classifier tried to read.
 *
 * `ref` is a SHORT HUMAN LABEL — an issue number (`#123`) or a repo-relative
 * path (`docs/plan.md`) — never the content itself, so it is safe to log and to
 * render. `status`: `used` = read and fed to the model, `empty` = present but
 * blank, `unavailable` = we knew about it but could not read it (the "missing
 * context" signal, surfaced in the UI and never silently hidden).
 */
export const IntentSource = z.object({
  kind: z.enum(['pr_title', 'pr_body', 'linked_issue', 'plan_doc', 'file_list', 'hunk_headers']),
  ref: z.string(),
  status: z.enum(['used', 'empty', 'unavailable']),
});
export type IntentSource = z.infer<typeof IntentSource>;

/**
 * The three new fields are `.nullish()` so every existing producer (PrBrief,
 * pre-migration `pr_intent` rows) keeps validating unchanged.
 */
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  /** Code-derived (see IntentConfidence); null on rows written before this. */
  confidence: IntentConfidence.nullish(),
  /** The source inventory the confidence was derived from. */
  sources: z.array(IntentSource).nullish(),
  /** `provider/model` that produced the classification, for auditability. */
  model: z.string().nullish(),
});
export type Intent = z.infer<typeof Intent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'wiring', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;

// ---------------------------------------------------------------------------
// PR Why + Risk Brief (the LIVE feature) — a NEW shape stored in `pr_brief.json`.
//
// Distinct from the dormant `PrBrief` above (which has no producer/consumer):
// this is the one-glance "what / why / where it hurts" a reviewer sees on the
// Overview. It reuses the leaf `RiskSeverity` enum but is otherwise independent.
// ---------------------------------------------------------------------------

/**
 * One risk area the reviewer should watch. `file_refs` are repo-relative paths
 * grounded against the diff's changed files; `endpoint_refs` are grounded
 * against the blast report's `impacted_endpoints`. Both are dropped in code
 * (never trusted from the model) when they name something outside the PR.
 */
export const BriefRisk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
  /** Optional "METHOD /path" refs; grounded against blast impacted_endpoints. */
  endpoint_refs: z.array(z.string()).nullish(),
});
export type BriefRisk = z.infer<typeof BriefRisk>;

/** A "read these first" pointer: a changed file, optional line, and why. */
export const ReviewFocus = z.object({
  file: z.string(),
  line: z.number().int().nullish(),
  reason: z.string(),
});
export type ReviewFocus = z.infer<typeof ReviewFocus>;

/**
 * The Brief itself. `risk_level` is DERIVED IN CODE as the max severity across
 * `risks[]` (the model never reports it — self-reported risk tracks commitment,
 * not correctness), same "model proposes, code disposes" gate as Intent.
 */
export const Brief = z.object({
  what: z.string(),
  why: z.string(),
  risk_level: RiskSeverity,
  risks: z.array(BriefRisk),
  review_focus: z.array(ReviewFocus),
});
export type Brief = z.infer<typeof Brief>;

/**
 * What the model returns — NO `risk_level` (code derives it) and `review_focus`
 * / `file_refs` are ungrounded candidates the code filters before persistence.
 */
export const LlmBriefCandidate = z.object({
  what: z.string().min(1),
  why: z.string().min(1),
  risks: z.array(BriefRisk),
  review_focus: z.array(ReviewFocus),
});
export type LlmBriefCandidate = z.infer<typeof LlmBriefCandidate>;

/**
 * The persisted Brief transport shape: the `Brief` plus the head-SHA cache key
 * (`state_key`) and the generation cost fields from its own `StructuredResult`.
 * `derived_at` is storage-only (ISO stamp).
 */
export const PrBriefRecord = Brief.extend({
  pr_id: z.string(),
  /** Head SHA the Brief was derived against — the staleness cache key. */
  state_key: z.string().nullish(),
  tokens_in: z.number().int().nullish(),
  tokens_out: z.number().int().nullish(),
  cost_usd: z.number().nullish(),
  model: z.string().nullish(),
  derived_at: z.string().nullish(),
});
export type PrBriefRecord = z.infer<typeof PrBriefRecord>;
