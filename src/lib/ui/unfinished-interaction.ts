export const unfinishedInteractionEvent = "foodedo:unfinished-interaction";

export type UnfinishedInteractionDetail = {
  message: string;
};

/**
 * Development-only marker for an intentionally unfinished interaction.
 * This is a build reminder, not user feedback or a production behavior.
 */
export function markUnfinishedInteraction(message: string): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<UnfinishedInteractionDetail>(unfinishedInteractionEvent, {
      detail: { message },
    }),
  );
}
