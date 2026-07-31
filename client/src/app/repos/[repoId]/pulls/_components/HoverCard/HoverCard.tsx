/* HoverCard — lightweight hover popover (no such UI primitive exists). Content
   mounts only while open, so a data-fetching child (e.g. ListFindingsPreview)
   fires its request on hover, not upfront. The card is rendered in a PORTAL with
   position:fixed so it escapes clipping ancestors (the PR table has
   overflow:hidden) and layers above the table. Small close delay lets the pointer
   travel from trigger to card. */
"use client";

import React from "react";
import { createPortal } from "react-dom";

const CARD_MAX_HEIGHT = 360; // keep in sync with FindingsPreview/styles.ts

export function HoverCard({
  trigger,
  children,
  width = 400,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<React.CSSProperties>({});
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  // Position the fixed portal card from the trigger's viewport rect; flip up when
  // there isn't room below.
  React.useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const flipUp = r.bottom + CARD_MAX_HEIGHT + 12 > window.innerHeight;
    setPos(
      flipUp
        ? { position: "fixed", bottom: window.innerHeight - r.top + 6, left, width, zIndex: 1000 }
        : { position: "fixed", top: r.bottom + 6, left, width, zIndex: 1000 },
    );
  }, [open, width]);

  // A rect that goes stale (scroll/resize) → just close.
  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  React.useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  return (
    <span
      ref={triggerRef}
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
    >
      {trigger}
      {open &&
        createPortal(
          <div role="dialog" onMouseEnter={openNow} onMouseLeave={closeSoon} style={pos}>
            {children}
          </div>,
          document.body,
        )}
    </span>
  );
}
