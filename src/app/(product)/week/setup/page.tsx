import { Suspense } from "react";
import { PlanSetupRoute } from "@/features/plan/plan-setup-page";
import { PlanReviewLoading } from "@/features/plan/plan-review-loading";

export default function PlanSetupRoutePage() {
  return (
    <Suspense fallback={<PlanReviewLoading />}>
      <PlanSetupRoute />
    </Suspense>
  );
}
