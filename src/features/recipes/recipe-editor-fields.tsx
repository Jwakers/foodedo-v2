"use client";

const fieldClass =
  "min-h-11 w-full rounded-compact border border-border bg-paper px-3 py-2 text-16 text-ink focus:border-cadmium focus:outline-none";

export function EditorField({
  label,
  value,
  multiline = false,
  onChange,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-12 font-semibold text-graphite">
      {label}
      {multiline ? (
        <textarea
          className={`${fieldClass} mt-1 min-h-24 resize-y`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={`${fieldClass} mt-1`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="block text-12 font-semibold text-graphite">
      {label}
      <input
        type="number"
        min={0}
        className={`${fieldClass} mt-1`}
        value={value ?? ""}
        onChange={(event) =>
          onChange(
            event.target.value === "" ? undefined : Number(event.target.value),
          )
        }
      />
    </label>
  );
}
