export const recipeImportSharingNotice =
  "Use AI to organise this recipe?\n\nTo turn your link or pasted text into a recipe, Foodedo sends the recipe content to OpenAI through Vercel AI Gateway. For social posts, we may also send the link and shared caption to Apify to find the recipe.\n\nThis may include personal information in the text you share. Only share content you’re comfortable sending to these services.\n\nChoose OK to continue or Cancel to stop. You can read the Privacy Policy in Help.";

/** Capacitor presents confirm() as an iOS alert; cancellation sends no new input. */
export function confirmRecipeImportSharing(
  native = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true",
  confirm: (message: string) => boolean = (message) => window.confirm(message),
) {
  return !native || confirm(recipeImportSharingNotice);
}
