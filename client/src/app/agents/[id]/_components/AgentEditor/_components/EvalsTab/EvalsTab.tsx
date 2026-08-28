/* Evals tab — owner metrics + case rows + dashboard link for an agent owner. */
"use client";

import React from "react";
import { OwnerEvalsPanel } from "@/components/OwnerEvalsPanel";

export function EvalsTab({ agentId }: { agentId: string }) {
  return <OwnerEvalsPanel ownerKind="agent" ownerId={agentId} />;
}
