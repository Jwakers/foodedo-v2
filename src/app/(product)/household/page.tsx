import { Suspense } from "react";
import { HouseholdPage } from "@/features/household/household-page";
export default function Page() {
  return (
    <Suspense>
      <HouseholdPage />
    </Suspense>
  );
}
