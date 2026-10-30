import { expect, test as base } from "@playwright/test";

/** Controlled fixtures must surface browser exceptions, not hide blank roots. */
export const test = base.extend<{ fixturePageErrors: void }>({
  fixturePageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      const recordError = (error: Error) => errors.push(error.message);
      page.on("pageerror", recordError);
      await use();
      page.off("pageerror", recordError);
      expect(errors, "Unexpected fixture browser exceptions").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
