/** Evals module constants. */

/** Studio default review strategy for an eval run (whole diff, one call). */
export const EVAL_REVIEW_STRATEGY = 'single-pass' as const;

/** A case passes when it recorded metrics and precision + recall are perfect. */
export const PASS_THRESHOLD = 1;
