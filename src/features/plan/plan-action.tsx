"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useHouseholdSpace } from "@/features/household/household-context";

/** Home starts the planning journey; only the setup view generates a plan. */
export function PlanAction() {
  const router = useRouter();
  const { isHousehold } = useHouseholdSpace();
  return (
    <div className="mt-3">
      <Button className="w-full" onClick={() => router.push("/week/setup")}>
        {isHousehold ? "Plan our week" : "Plan my week"}
        <ArrowRight aria-hidden="true" className="size-4.5" />
      </Button>
    </div>
  );
}
