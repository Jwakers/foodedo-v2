/** Shared across save surfaces so reversals and account changes cancel feedback. */
export function createRecipeSaveConfirmation(
  show: () => void,
  dismiss: () => void,
) {
  let identity: string | null = null;
  let epoch = 0;
  let visibleMeal: string | null = null;
  const desired = new Map<string, boolean>();

  return {
    setIdentity(next: string | null) {
      if (identity === next) return;
      identity = next;
      epoch++;
      desired.clear();
      visibleMeal = null;
      dismiss();
    },
    begin(subject: string, meal: string, saved: boolean) {
      const initiatedEpoch = epoch;
      if (subject === identity) {
        desired.set(meal, saved);
        if (!saved && visibleMeal === meal) {
          visibleMeal = null;
          dismiss();
        }
      }
      return (showSavedConfirmation: boolean) => {
        if (
          showSavedConfirmation &&
          saved &&
          subject === identity &&
          initiatedEpoch === epoch &&
          desired.get(meal) === true
        ) {
          visibleMeal = meal;
          show();
        }
      };
    },
  };
}
