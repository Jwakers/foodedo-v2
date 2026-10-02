"use client";

import { ArrowRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { RecipeReviewIssue } from "@/lib/domain/recipes";

export function RecipeReviewDrawer({
  open,
  issues,
  values,
  onValuesChange,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  issues: RecipeReviewIssue[];
  values: Record<string, string>;
  onValuesChange: (values: Record<string, string>) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  const metadataIssues = issues;
  const complete = recipeRepairValuesComplete(metadataIssues, values);
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <div>
            <DrawerTitle>Finish this recipe</DrawerTitle>
            <DrawerDescription className="mt-1.5 text-15">
              Add the details you know. You can return to this recipe later.
            </DrawerDescription>
          </div>
          <Button
            variant="ghost"
            size="headerIcon"
            aria-label="Close recipe review"
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden="true" className="size-5" />
          </Button>
        </DrawerHeader>
        <DrawerBody className="flex flex-col gap-5 pt-2">
          {metadataIssues.includes("prep_minutes") &&
          metadataIssues.includes("cook_minutes") ? (
            <p className="text-13 leading-5 text-graphite">
              Add whichever time you know. One is enough to finish the recipe.
            </p>
          ) : null}
          {metadataIssues.map((issue) => (
            <label key={issue} className="block text-14 font-semibold text-ink">
              <span className="block text-10 font-bold tracking-overline text-cadmium uppercase">
                Missing
              </span>
              <span className="mt-1.5 block">
                {recipeReviewIssueLabel(issue)}
              </span>
              <span className="mt-2 flex items-center gap-2 text-14 font-normal text-graphite">
                <input
                  inputMode="numeric"
                  value={values[issue] ?? ""}
                  onChange={(event) =>
                    onValuesChange({ ...values, [issue]: event.target.value })
                  }
                  className="h-13 w-22 rounded-compact border border-border bg-mist px-3 text-center text-18 font-semibold text-ink outline-none focus:border-ink"
                />
                {issue === "servings" ? "people" : "minutes"}
              </span>
            </label>
          ))}
        </DrawerBody>
        <DrawerFooter>
          <Button className="w-full" disabled={!complete} onClick={onSave}>
            Save and finish <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
          <Button
            variant="inline"
            size="block"
            className="mt-2"
            onClick={() => onOpenChange(false)}
          >
            Not now
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export function buildRecipeRepairPatch(
  issues: RecipeReviewIssue[],
  values: Record<string, string>,
) {
  const metadataIssues = issues;
  const result: {
    servings?: number;
    prepMinutes?: number;
    cookMinutes?: number;
  } = {};
  for (const issue of metadataIssues) {
    const rawValue = values[issue]?.trim();
    if (!rawValue && issue !== "servings") continue;
    if (!validWholeNumber(rawValue, issue === "servings" ? 1 : 0)) return null;
    const value = Number(rawValue);
    if (issue === "servings") result.servings = value;
    if (issue === "prep_minutes") result.prepMinutes = value;
    if (issue === "cook_minutes") result.cookMinutes = value;
  }
  const needsTime = metadataIssues.some((issue) => issue !== "servings");
  if (
    needsTime &&
    result.prepMinutes === undefined &&
    result.cookMinutes === undefined
  )
    return null;
  return result;
}

export function recipeReviewIssueLabel(issue: RecipeReviewIssue) {
  if (issue === "servings") return "servings";
  if (issue === "prep_minutes") return "preparation time";
  return "cooking time";
}

function recipeRepairValuesComplete(
  issues: RecipeReviewIssue[],
  values: Record<string, string>,
) {
  if (issues.includes("servings") && !validWholeNumber(values.servings, 1))
    return false;
  const timeIssues = issues.filter((issue) => issue !== "servings");
  if (timeIssues.length === 0) return true;
  return timeIssues.some((issue) => validWholeNumber(values[issue], 0));
}

function validWholeNumber(value: string | undefined, minimum = 0) {
  if (value === undefined || value.trim() === "") return false;
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= 10_080;
}
