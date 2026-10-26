import { expect, test } from "@playwright/test";
import { formatRecipeHeading } from "../../src/lib/domain/recipe-headings";

test("humanises heading keys while preserving authored casing and punctuation", () => {
  expect(formatRecipeHeading("pasta_and_sauce")).toBe("Pasta and sauce");
  expect(formatRecipeHeading("__pasta__and_ sauce__")).toBe("Pasta and sauce");
  expect(formatRecipeHeading("BBQ_chicken_and_rice")).toBe(
    "BBQ chicken and rice",
  );
  expect(formatRecipeHeading("Crème_fraîche_sauce")).toBe(
    "Crème fraîche sauce",
  );
  expect(formatRecipeHeading("Chef’s notes: pasta & sauce")).toBe(
    "Chef’s notes: pasta & sauce",
  );
  expect(formatRecipeHeading("___")).toBe("");
  expect(formatRecipeHeading("Pasta and sauce")).toBe("Pasta and sauce");
});
