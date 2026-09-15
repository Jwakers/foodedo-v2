export const foodedoFeedbackEvent = "foodedo:feedback";

export type FoodedoFeedbackDetail = {
  message: string;
};

/**
 * Developer-only marker for intentionally unfinished interactions.
 * Never use this for real user outcomes, errors, or lifecycle messaging.
 */
export function temporaryFeedback(message: string): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<FoodedoFeedbackDetail>(foodedoFeedbackEvent, {
      detail: { message },
    }),
  );
}
