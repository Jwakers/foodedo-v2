import type { Redirect } from "next/dist/lib/load-custom-routes";

/** Permanent redirects for merged and removed editorial posts. */
export const blogRedirects: Redirect[] = [
  {
    source: "/blog/meal-planning-busy-families-simple-weekly-system",
    destination: "/blog/meal-planning-for-busy-families",
    permanent: true,
  },
  {
    source: "/blog/overcoming-meal-planning-challenges-busy-families",
    destination: "/blog/meal-planning-for-busy-families",
    permanent: true,
  },
  {
    source: "/blog/quick-weeknight-dinners-busy-families",
    destination: "/blog/meal-planning-for-busy-families",
    permanent: true,
  },
  {
    source: "/blog/stop-asking-whats-for-dinner-foodedo",
    destination:
      "/blog/why-deciding-whats-for-dinner-is-harder-than-cooking-it",
    permanent: true,
  },
  {
    source: "/blog/eliminate-weekly-food-decisions-meal-planning",
    destination:
      "/blog/why-deciding-whats-for-dinner-is-harder-than-cooking-it",
    permanent: true,
  },
  {
    source: "/blog/simplified-meal-planning-for-those-who-hate-it",
    destination:
      "/blog/why-deciding-whats-for-dinner-is-harder-than-cooking-it",
    permanent: true,
  },
  {
    source: "/blog/efficiently-organise-recipe-collection",
    destination: "/blog/how-to-save-and-organise-recipes-from-websites",
    permanent: true,
  },
  {
    source: "/blog/weekly-meal-plan-family-of-4-shopping-list",
    destination: "/blog/tips-for-planning-family-friendly-weekly-meal-plan",
    permanent: true,
  },
  {
    source: "/blog/what-to-cook-this-week-meal-plan-generator",
    destination: "/blog/tips-for-planning-family-friendly-weekly-meal-plan",
    permanent: true,
  },
  {
    source: "/blog/use-foodedo-for-stress-free-family-dinners",
    destination: "/blog/tips-for-planning-family-friendly-weekly-meal-plan",
    permanent: true,
  },
  {
    source: "/blog/best-family-meal-planner-apps",
    destination: "/blog/best-meal-planner-apps",
    permanent: true,
  },
  {
    source: "/blog/best-weekly-meal-planner-apps",
    destination: "/blog/best-meal-planner-apps",
    permanent: true,
  },
  {
    source: "/blog/best-meal-planner-apps-with-a-shopping-list",
    destination: "/blog/best-meal-planner-apps",
    permanent: true,
  },
  {
    source: "/blog/best-digital-recipe-book-apps",
    destination: "/blog/best-apps-to-save-recipes",
    permanent: true,
  },
  {
    source: "/blog/best-apps-to-save-recipes-from-social-media",
    destination: "/blog/best-apps-to-save-recipes",
    permanent: true,
  },
  {
    source: "/blog/best-apps-to-turn-recipes-into-a-shopping-list",
    destination: "/blog/best-shopping-list-apps",
    permanent: true,
  },
  {
    source: "/blog/why-you-need-a-rice-cooker-for-family-meal-planning",
    destination: "/blog",
    permanent: true,
  },
  {
    source: "/blog/keeping-kitchen-cupboards-organised",
    destination: "/blog",
    permanent: true,
  },
  {
    source: "/blog/key-principles-cooking-delicious-meals",
    destination: "/blog",
    permanent: true,
  },
  {
    source: "/blog/how-to-cook-chicken-thighs-perfectly-every-time",
    destination: "/blog",
    permanent: true,
  },
];

export default blogRedirects;
