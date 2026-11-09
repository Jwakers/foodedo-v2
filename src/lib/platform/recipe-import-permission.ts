export const recipeImportSharingNotice =
  "Allow recipe processing?\n\nFoodedo sends the recipe text you paste, or content fetched from your link, to OpenAI through Vercel AI Gateway to organise the recipe. Social links and shared captions may also be sent to Apify to retrieve the recipe. This can include personal information contained in that content.\n\nOnly share content you are comfortable sending to these services. Choose OK to allow processing, or Cancel to stop this request. See Privacy Policy in Help for more information.";

/** Capacitor presents confirm() as an iOS alert; cancellation sends no new input. */
export function confirmRecipeImportSharing(
  native = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true",
  confirm: (message: string) => boolean = (message) => window.confirm(message),
) {
  return !native || confirm(recipeImportSharingNotice);
}
