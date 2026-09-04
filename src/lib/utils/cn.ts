import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge, validators } from "tailwind-merge";

/**
 * Foodedo’s Paper type scale uses numeric `text-*` tokens (`text-13`, …).
 * Without registering those as font sizes, tailwind-merge treats them as the
 * same group as `text-ink` / `text-leaf` and drops one of them.
 *
 * @see https://github.com/dcastil/tailwind-merge/blob/main/docs/configuration.md
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [validators.isNumber] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
