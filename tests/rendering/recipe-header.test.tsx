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
import { useRecipeHeader } from "@/features/recipes/use-recipe-header";

function HeaderRecipe({ path, search }: { path: string; search: string }) {
  const recipe = useRecipeHeader(path, new URLSearchParams(search));
  return <span>{recipe?.slug ?? "no public actions"}</span>;
}
const render = (path: string, search = "") =>
  renderToStaticMarkup(<HeaderRecipe path={path} search={search} />);
beforeEach(() => {
  vi.resetAllMocks();
  queries.current.mockImplementation((slug) => (slug ? { slug } : undefined));
  queries.pinned.mockImplementation((id) =>
    id ? { slug: `public-${id}` } : undefined,
  );
});

test("public browsing and native/query links resolve the same recipe", () => {
  expect(render("/recipes/pasta")).toContain("pasta");
  expect(render("/recipes/view", "slug=pasta")).toContain("pasta");
});

test("Home and plan snapshots resolve favourite identity and public sharing slug", () => {
  queries.personal.mockReturnValue({
    slug: "personal-private-id",
    source: {
      type: "catalogue",
      catalogueMealId: "pasta",
      catalogueVersion: 2,
    },
  });
  expect(render("/recipes/view", "recipeId=private-id")).toContain(
    "public-pasta",
  );
  expect(queries.pinned).toHaveBeenLastCalledWith("pasta", 2);
});

test("pinned guest links use the displayed revision rather than the current slug", () => {
  expect(
    render(
      "/recipes/view",
      "slug=new-slug&catalogueMealId=pasta&catalogueVersion=2",
    ),
  ).toContain("public-pasta");
  expect(queries.current).toHaveBeenCalledWith(null);
});

test("private imports and unresolved personal recipes never share a fabricated public URL", () => {
  for (const personal of [undefined, null, { source: { type: "import" } }]) {
    queries.personal.mockReturnValue(personal);
    expect(render("/recipes/view", "recipeId=private-id&slug=pasta")).toContain(
      "no public actions",
    );
  }
});

test("canonical public pages ignore conflicting query recipe identities", () => {
  expect(
    render(
      "/recipes/pasta",
      "recipeId=private&catalogueMealId=other&catalogueVersion=2",
    ),
  ).toContain("pasta");
  expect(queries.personal).toHaveBeenCalledWith(null);
  expect(queries.pinned).toHaveBeenLastCalledWith(null, null);
});
