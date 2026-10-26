"use client";

import { useId } from "react";
import { adminInputClass } from "./editorial-tags-editor";

export function PhotographGuidanceField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const helpId = useId();
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold">
        Photo guidance (optional)
        <textarea
          rows={3}
          maxLength={2000}
          className={`${adminInputClass} mt-2`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-describedby={helpId}
          placeholder="Show the boneless, skinless chicken in small pieces, as described in the recipe."
        />
      </label>
      <p id={helpId} className="text-sm text-graphite">
        Describe what looks wrong or how the new photograph should look. The
        ingredients and method stay unchanged.
      </p>
    </div>
  );
}
