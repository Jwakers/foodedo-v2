// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const queries = vi.hoisted(() => ({
  pinned: vi.fn(),
  current: vi.fn(),
  personal: vi.fn(),
}));
vi.mock("@/features/recipes/use-catalogue", () => ({
  useCatalogueMeal: queries.pinned,
  useCurrentCatalogueMeal: queries.current,
}));
vi.mock("@/features/recipes/use-personal-recipe", () => ({
  usePersonalRecipe: queries.personal,
}));
import { useRecipeSource } from "@/features/recipes/use-recipe-source";

function Source({ search }: { search: string }) {
  const { meal } = useRecipeSource(new URLSearchParams(search));
  return (
    <span>
      {meal === undefined
        ? "loading"
        : meal === null
          ? "unavailable"
          : meal.title}
    </span>
  );
}
const render = (search: string) =>
  renderToStaticMarkup(<Source search={search} />);
beforeEach(() => {
  vi.resetAllMocks();
  queries.current.mockReturnValue({ title: "Current revision" });
  queries.pinned.mockReturnValue({ title: "Retired pinned revision" });
  queries.personal.mockReturnValue({ title: "Private snapshot" });
});

test("personal snapshots take precedence over a conflicting catalogue reference and slug", () => {
  expect(
    render(
      "recipeId=private&slug=pasta&catalogueMealId=pasta&catalogueVersion=2",
    ),
  ).toContain("Private snapshot");
  expect(queries.personal).toHaveBeenCalledWith("private");
  queries.personal.mockReturnValue(null);
  expect(render("recipeId=private&slug=pasta")).toContain("unavailable");
});

test("a pinned revision cannot be replaced with the current slug's content", () => {
  expect(
    render("slug=pasta&catalogueMealId=pasta&catalogueVersion=2"),
  ).toContain("Retired pinned revision");
  expect(queries.pinned).toHaveBeenCalledWith("pasta", 2);
  expect(queries.current).toHaveBeenCalledWith(null);
  queries.pinned.mockReturnValue(null);
  expect(
    render("slug=pasta&catalogueMealId=pasta&catalogueVersion=2"),
  ).toContain("unavailable");
});

test("direct visits and malformed pins resolve the current slug", () => {
  for (const suffix of ["", "&catalogueMealId=pasta&catalogueVersion=0"]) {
    expect(render(`slug=pasta${suffix}`)).toContain("Current revision");
    expect(queries.current).toHaveBeenLastCalledWith("pasta");
    expect(queries.pinned).toHaveBeenLastCalledWith(null, null);
  }
});

test("unresolved personal and pinned queries remain loading without catalogue fallback", () => {
  queries.personal.mockReturnValue(undefined);
  expect(render("recipeId=private&slug=pasta")).toContain("loading");
  queries.pinned.mockReturnValue(undefined);
  expect(
    render("slug=pasta&catalogueMealId=pasta&catalogueVersion=2"),
  ).toContain("loading");
});
