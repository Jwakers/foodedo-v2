# Components

Shared UI lives here. Do not add a broad component library speculatively;
promote an atom only when the approved product UI already repeats it.

## Design-system foundation

- `src/app/design-tokens.css` is the code mirror of the approved Paper tokens.
- Prefer the Paper token names directly (`text-ink`, `bg-leaf-soft`,
  `rounded-compact`, `font-ui`) in new product UI.
- Existing semantic utilities such as `text-foreground` remain as token-backed
  migration aliases. Do not introduce literal colours in components.
- `ui/button.tsx` owns the approved 48px primary and secondary action styles and
  can also provide classes for links through `buttonClassName`.
- Use `cn` from `@/lib/utils/cn` for conditional or composed class names.
- Add variants only when they exist in the approved designs.
