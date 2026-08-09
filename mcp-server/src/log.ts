/**
 * stderr-only logger. stdout is the JSON-RPC channel for the stdio transport —
 * ANY write to stdout corrupts the protocol, so we NEVER write to stdout.
 * Verification gate: grepping the src tree for a stdout-write call must be empty.
 */
export const log = console.error;
