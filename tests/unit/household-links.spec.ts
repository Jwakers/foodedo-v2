import { expect, test } from "@playwright/test";
import { householdInvitePath } from "@/lib/domain/household-links";
const token = "a".repeat(64);
test("normalises trusted HTTPS invitations and keeps the entire token", () => {
  expect(
    householdInvitePath(
      `https://foodedo.com/household/join?token=${token}&utm_source=text`,
      "https://foodedo.com",
    ),
  ).toBe(`/household/join?token=${token}`);
});
test("ignores OAuth and untrusted or malformed deep links", () => {
  for (const url of [
    `com.foodedo.app://callback?code=test`,
    `https://attacker.example/household/join?token=${token}`,
    `https://foodedo.com.attacker.example/household/join?token=${token}`,
    `http://foodedo.com/household/join?token=${token}`,
    `https://user@foodedo.com/household/join?token=${token}`,
    `https://foodedo.com/recipes/view?token=${token}`,
    `https://foodedo.com/household/join?token=short`,
    `https://foodedo.com/household/join?token=${token}&token=${token}`,
    "not a url",
  ])
    expect(householdInvitePath(url, "https://foodedo.com")).toBeNull();
});
