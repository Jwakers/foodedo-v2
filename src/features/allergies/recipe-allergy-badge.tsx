"use client";

import { TriangleAlert } from "lucide-react";
import type { AllergyEvidence } from "@/lib/domain/allergies";
import { useAllergies } from "./allergy-context";
import { allergyWarningText } from "./allergy-warning";

/** Shared image overlay for recipe listing and carousel cards. */
export function RecipeAllergyBadge({
  evidence,
}: {
  evidence: Partial<AllergyEvidence>;
}) {
  const { effectiveIds } = useAllergies();
  const allergyLabel = allergyWarningText(evidence, effectiveIds);
  return allergyLabel ? (
    <span className="absolute bottom-2 left-2 right-2 flex w-fit max-w-[calc(100%-16px)] items-start gap-1 rounded-md bg-cadmium-soft px-2 py-1 text-12 font-semibold text-cadmium">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
      {allergyLabel}
    </span>
  ) : null;
}
