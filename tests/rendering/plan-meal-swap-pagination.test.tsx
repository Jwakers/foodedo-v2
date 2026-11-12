// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogueMealSummary } from "@/lib/domain/recipes";

const query = vi.hoisted(() => vi.fn());
vi.mock("convex-helpers/react", () => ({ usePaginatedQuery: query }));
vi.mock("@/components/ui/drawer-stack", () => ({
  useDrawerStack: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/ui/drawer-stack-header", () => ({
  DrawerStackHeader: () => null,
}));
vi.mock("@/features/allergies/allergy-context", () => ({
  useAllergies: () => ({ effectiveIds: [], ready: true }),
}));
import { PlanMealSwap } from "@/features/plan/plan-meal-swap";
import { api } from "../../convex/_generated/api";

const meals = Array.from({ length: 20 }, (_, index) => ({
  id: `meal-${index}`,
  title: `Recipe ${index}`,
  proteinCategory: "meat-free",
})) as CatalogueMealSummary[];
const render = (props: Partial<Parameters<typeof PlanMealSwap>[0]> = {}) =>
  renderToStaticMarkup(
    <PlanMealSwap
      date="2026-11-12"
      onSwap={vi.fn()}
      onOpenPreview={vi.fn()}
      {...props}
    />,
  );
beforeEach(() => {
  query.mockReset();
  query.mockReturnValue({
    results: meals,
    status: "CanLoadMore",
    loadMore: vi.fn(),
  });
});

test("picker requests bounded catalogue pages with server-side filtering and sorting", () => {
  const filters = {
    under30Minutes: true,
    budgetFriendly: true,
    proteinCategories: ["fish" as const],
  };
  const html = render({ filters, sort: "quickest", currentMeal: meals[0] });
  expect(query).toHaveBeenCalledWith(
    api.catalogue.list,
    { ...filters, sort: "quickest", searchQuery: "" },
    { initialNumItems: 20 },
  );
  expect(html).not.toContain('aria-label="Select Recipe 0"');
  expect(html.match(/aria-label="Select Recipe /g)).toHaveLength(19);
  expect(html).toContain("19 recipes loaded");
  expect(html).toContain("Load more");
});

test("first page loading does not claim the catalogue is empty", () => {
  query.mockReturnValue({ results: [], status: "LoadingFirstPage" });
  const html = render();
  expect(html).toContain("Loading recipes…");
  expect(html).not.toContain("No recipes match");
  expect(html).not.toContain("Load more");
});

test("sparse pages allow continued searching until the query is exhausted", () => {
  query.mockReturnValue({ results: [], status: "CanLoadMore" });
  expect(render()).toContain("No matches in this batch");
  expect(render()).toContain("Load more");
  query.mockReturnValue({ results: [], status: "Exhausted" });
  expect(render()).toContain("No recipes match your search or filters.");
  expect(render()).not.toContain("Load more");
});

test("loading another page keeps existing choices and disables the shared control", () => {
  query.mockReturnValue({ results: meals, status: "LoadingMore" });
  const html = render();
  expect(html.match(/aria-label="Select Recipe /g)).toHaveLength(20);
  expect(html).toMatch(
    /<button[^>]*disabled=""[^>]*aria-busy="true"[^>]*>Loading more…/,
  );
  query.mockReturnValue({ results: meals, status: "Exhausted" });
  expect(render()).not.toContain("Load more");
  expect(render()).not.toContain("recipes loaded");
});
