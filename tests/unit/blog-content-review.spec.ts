import { expect, test } from "@playwright/test";
import guides from "../../src/features/blog/guides.json";
import pages from "../../src/features/public-pages/pages.json";

test("local help describes setup before generation and has no chalkboard instructions", () => {
  expect(JSON.stringify([...guides, ...pages])).not.toMatch(
    /chalkboard|Discover tab|free trial/i,
  );
  const howTo = pages.find((page) => page.path === "/support/how-to-use")!;
  expect(howTo.sections[0].body).toContain("In Plan your week");
  expect(howTo.sections[0].body).toContain("start date and servings");
  expect(howTo.sections.at(-1)?.body).toContain("save automatically");
});
