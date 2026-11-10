export const recipeImportSharingNotice =
  "Add this recipe with AI?\n\nFoodedo sends recipe text to OpenAI through Vercel to organise it. Social links and captions may also be sent to Apify.\n\nOnly share content you’re comfortable sending to these services. Choose OK to allow this import or Cancel to stop. Details: Privacy Policy in Help.";

/** Capacitor presents confirm() as an iOS alert; cancellation sends no new input. */
export function confirmRecipeImportSharing(
  native = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true",
  confirm: (message: string) => boolean = (message) => window.confirm(message),
) {
  return !native || confirm(recipeImportSharingNotice);
}
