import { Suspense } from "react";
import { JoinHouseholdPage } from "@/features/household/join-household-page";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default function Page() {
  return (
    <Suspense>
      <JoinHouseholdPage />
    </Suspense>
  );
}
