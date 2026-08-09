/**
 * Tool-result shapers — the single place that enforces B4 and B8.
 *
 * B4 (dual content): every success returns BOTH `structuredContent` (the object)
 * AND a `content: [{type:'text', text: JSON.stringify(...)}]` block, because the
 * MCP spec requires the serialized-JSON text block for clients that don't read
 * structuredContent.
 *
 * B8 (two-tier errors): expected failures (API down, not-found, business
 * failure) are tool results with `isError: true` and actionable recovery text —
 * NOT thrown JSON-RPC errors. An empty result is a success, not an error.
 */

/** structuredContent must be a JSON object (index-signature compatible). */
export type JsonObject = Record<string, unknown>;

export interface ToolResult {
  // Index signature required for structural compatibility with the SDK's
  // CallToolResult, which declares `[x: string]: unknown` (typescript-expert §5).
  [x: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent?: JsonObject;
  isError?: boolean;
}

/** Success: dual-content (structuredContent + serialized-JSON text block). */
export function toolOk(obj: JsonObject): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(obj) }],
    structuredContent: obj,
  };
}

/**
 * Expected failure: `isError: true` with a human-readable message and, when
 * available, a `recovery` hint the model can self-correct on. Also mirrored into
 * structuredContent so structured-only clients see the error too.
 */
export function toolError(message: string, opts?: { recovery?: string }): ToolResult {
  const recovery = opts?.recovery;
  const text = recovery ? `${message}\n\nRecovery: ${recovery}` : message;
  return {
    content: [{ type: 'text', text }],
    structuredContent: { error: message, ...(recovery ? { recovery } : {}) },
    isError: true,
  };
}
