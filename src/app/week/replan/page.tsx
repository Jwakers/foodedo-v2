import { Suspense } from "react";
import { ReplanReview } from "@/features/plan/replan-review";
export default function ReplanWeekRoutePage() {
  return (
    <Suspense>
      <ReplanReview />
    </Suspense>
  );
}
