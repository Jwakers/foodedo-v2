"use client";

import { TriangleAlert } from "lucide-react";
import {
  ALLERGY_REMINDER,
  allergyMatches,
  allergyNames,
  type AllergyEvidence,
} from "@/lib/domain/allergies";
import { useAllergies } from "./allergy-context";

export function allergyWarningText(
  evidence: Partial<AllergyEvidence>,
  selected: readonly string[],
) {
  if (
    selected.length > 0 &&
    (evidence.allergenIds === undefined ||
      evidence.possibleAllergenIds === undefined)
  )
    return "Check ingredients for your allergies";
  const hits = allergyMatches(evidence, selected);
  if (hits.known.length)
    return `Contains ${allergyNames(hits.known).join(", ").toLowerCase()}`;
  if (hits.possible.length)
    return `Check for ${allergyNames(hits.possible).join(", ").toLowerCase()}`;
  return null;
}
export function AllergyWarning({
  evidence,
  title,
  compact = false,
}: {
  evidence: Partial<AllergyEvidence>;
  title?: string;
  compact?: boolean;
}) {
  const { effectiveIds } = useAllergies();
  const label = allergyWarningText(evidence, effectiveIds);
  if (!label) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-surface bg-cadmium-soft p-3 text-cadmium">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="text-14 font-semibold">
          {title ? `${title}: ${label.toLowerCase()}.` : label}
        </p>
        <p
          className={`${compact ? "text-12" : "text-13"} mt-1 leading-5 text-graphite`}
        >
          {ALLERGY_REMINDER}
        </p>
      </div>
    </div>
  );
}
