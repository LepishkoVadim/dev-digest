/* Evals tab — owner metrics + case rows + dashboard link for a skill owner. */
"use client";

import React from "react";
import { OwnerEvalsPanel } from "@/components/OwnerEvalsPanel";

export function EvalsTab({ skillId }: { skillId: string }) {
  return <OwnerEvalsPanel ownerKind="skill" ownerId={skillId} />;
}
