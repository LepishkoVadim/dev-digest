/* BlastGraph — a real 3-column node/edge graph for the Blast "Graph" view:
   changed symbols → their callers → the endpoints/crons those callers expose.
   Nodes are absolutely positioned; edges are SVG cubic-bezier paths between the
   right edge of a source node and the left edge of its target. Pure render. */
"use client";

import React from "react";
import type { BlastReportSymbol } from "@devdigest/shared";

// Fixed vertical geometry so node centres are known → edges are exact. Column
// widths are computed from the longest label so text never truncates (the
// horizontal wrapper scrolls if the whole graph is wider than the card).
const NODE_H = 32;
const V_GAP = 16;
const COL_GAP = 54;
const PAD_Y = 6;
const CHAR_W = 8; // generous px-per-char estimate (mono-ish)
const NODE_PAD = 28; // horizontal padding + border allowance
const MIN_SYM_W = 90;
const MIN_CALL_W = 110;
const MIN_EP_W = 140;

interface GNode {
  id: string;
  label: string;
  kind: "symbol" | "caller" | "endpoint" | "cron";
}

function symLabel(s: { name: string; kind: string }): string {
  return s.kind === "function" || s.kind === "method" ? `${s.name}()` : s.name;
}

export function BlastGraph({ symbols }: { symbols: BlastReportSymbol[] }) {
  // ---- build nodes + edges ----
  const symNodes: GNode[] = symbols.map((s) => ({
    id: `s:${s.name}`,
    label: symLabel(s),
    kind: "symbol",
  }));
  const callers = new Map<string, GNode>();
  const targets = new Map<string, GNode>();
  const edgeSet = new Set<string>();
  const edges: Array<{ from: string; to: string }> = [];
  const addEdge = (from: string, to: string) => {
    const k = `${from}->${to}`;
    if (edgeSet.has(k)) return;
    edgeSet.add(k);
    edges.push({ from, to });
  };

  for (const s of symbols) {
    for (const c of s.callers) {
      const cid = `c:${c.symbol}`;
      if (!callers.has(cid)) callers.set(cid, { id: cid, label: c.symbol, kind: "caller" });
      addEdge(`s:${s.name}`, cid);
      for (const ep of c.endpoints) {
        const eid = `e:${ep}`;
        if (!targets.has(eid)) targets.set(eid, { id: eid, label: ep, kind: "endpoint" });
        addEdge(cid, eid);
      }
      for (const cr of c.crons) {
        const kid = `k:${cr}`;
        if (!targets.has(kid)) targets.set(kid, { id: kid, label: cr, kind: "cron" });
        addEdge(cid, kid);
      }
    }
  }

  const callerNodes = [...callers.values()];
  const targetNodes = [...targets.values()];

  if (symNodes.length === 0 || (callerNodes.length === 0 && targetNodes.length === 0)) {
    return null; // caller renders the empty message
  }

  // ---- layout ----
  const rows = Math.max(symNodes.length, callerNodes.length, targetNodes.length, 1);
  const height = rows * NODE_H + (rows - 1) * V_GAP + PAD_Y * 2;
  const colWidth = (nodes: GNode[], min: number) =>
    nodes.reduce((m, n) => Math.max(m, n.label.length * CHAR_W + NODE_PAD), min);
  const symW = colWidth(symNodes, MIN_SYM_W);
  const callW = colWidth(callerNodes, MIN_CALL_W);
  const epW = colWidth(targetNodes, MIN_EP_W);
  const callX = symW + COL_GAP;
  const epX = callX + callW + COL_GAP;
  const width = epX + epW;

  const pos = new Map<string, { x: number; y: number; w: number }>();
  const place = (nodes: GNode[], x: number, w: number) => {
    const total = nodes.length * NODE_H + (nodes.length - 1) * V_GAP;
    const start = PAD_Y + (height - PAD_Y * 2 - total) / 2;
    nodes.forEach((n, i) => pos.set(n.id, { x, y: start + i * (NODE_H + V_GAP), w }));
  };
  place(symNodes, 0, symW);
  place(callerNodes, callX, callW);
  place(targetNodes, epX, epW);

  const edgePath = (from: string, to: string): string => {
    const a = pos.get(from);
    const b = pos.get(to);
    if (!a || !b) return "";
    const x1 = a.x + a.w;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_H / 2;
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  };

  const nodeStyle = (n: GNode): React.CSSProperties => {
    const p = pos.get(n.id)!;
    const border =
      n.kind === "symbol" || n.kind === "endpoint"
        ? "var(--accent-text, #7aa2f7)"
        : n.kind === "cron"
          ? "var(--warn, #fbbf24)"
          : "var(--border-strong, var(--border))";
    const color =
      n.kind === "endpoint"
        ? "var(--accent-text, #7aa2f7)"
        : n.kind === "cron"
          ? "var(--warn, #fbbf24)"
          : "var(--text-primary)";
    return {
      position: "absolute",
      left: p.x,
      top: p.y,
      width: p.w,
      height: NODE_H,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 10px",
      borderRadius: 8,
      border: `1px solid ${border}`,
      background: "var(--bg-elevated)",
      color,
      fontSize: 12.5,
      fontFamily:
        n.kind === "caller" ? "inherit" : "var(--font-mono, monospace)",
      whiteSpace: "nowrap",
    };
  };

  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <div style={{ position: "relative", width, height }}>
        <svg
          width={width}
          height={height}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          aria-hidden
        >
          {edges.map((e) => (
            <path
              key={`${e.from}->${e.to}`}
              d={edgePath(e.from, e.to)}
              fill="none"
              stroke="var(--border-strong, var(--border))"
              strokeWidth={1.5}
              opacity={0.8}
            />
          ))}
        </svg>
        {[...symNodes, ...callerNodes, ...targetNodes].map((n) => (
          <div key={n.id} style={nodeStyle(n)} title={n.label}>
            {n.label}
          </div>
        ))}
      </div>
    </div>
  );
}
