/** Format a heading for display only; never write this value back to recipe data. */
export function formatRecipeHeading(value: string): string {
  if (!value.includes("_")) return value;
  const heading = value.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  return heading.charAt(0).toUpperCase() + heading.slice(1);
}
