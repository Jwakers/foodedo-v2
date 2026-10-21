import { UsersRound } from "lucide-react";

import { FeatureDiscovery } from "@/components/feature-discovery";

/** Home's quiet entry for signed-in accounts without a household. */
export function HouseholdDiscovery() {
  return (
    <FeatureDiscovery
      headingId="household-discovery-heading"
      href="/household"
      label="Meals & shopping, shared"
      title="Share your week"
      action="Create a household"
      icon={<UsersRound className="size-6" strokeWidth={1.7} />}
      tone="leaf"
      className="mt-6"
    />
  );
}
