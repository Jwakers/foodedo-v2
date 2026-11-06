/** Sentence scope without treating decimal points as instruction boundaries. */
export function ingredientSentenceAt(text: string, start: number, end: number) {
  const boundary = (index: number) =>
    /[!?;\n]/.test(text[index]!) ||
    (text[index] === "." &&
      !(/\d/.test(text[index - 1] ?? "") && /\d/.test(text[index + 1] ?? "")));
  let left = start - 1;
  while (left >= 0 && !boundary(left)) left--;
  let right = end;
  while (right < text.length && !boundary(right)) right++;
  return {
    before: text.slice(left + 1, start),
    after: text.slice(end, right),
    text: text.slice(left + 1, right),
  };
}

/** Explicit omissions can cover a coordinated ingredient list. A later cooking
 * action starts a new scope: "omit onion, then add garlic" still links garlic.
 */
export function excludedIngredient(before: string, after: string) {
  if (/\b(?:all at once|until|yet)\b/i.test(after)) return false;
  if (
    /\b(?:replace|substitute)\s+(?:the\s+)?$/i.test(before) &&
    /^\s+with\b/i.test(after)
  )
    return true;
  if (/\bsubstitute\b[^.!?;]*\bfor\s+(?:the\s+)?$/i.test(before)) return true;
  const exclusions = Array.from(
    before.matchAll(
      /\b(?:without(?:\s+(?:adding|using))?|omit(?:ting)?|leave out|skip|instead of|rather than|except|(?:do not|don't|never)\s+(?:add|use|include|mix in|stir in)|no need to\s+(?:add|use|include)|no(?!\s+more\s+than\b)(?:\s+more)?)\b/gi,
    ),
  );
  const exclusion = exclusions.at(-1);
  if (!exclusion)
    return /\bnot\s+(?:(?:the|any|fresh|dried|ground|whole)\s+)*$/i.test(
      before,
    );
  const tail = before.slice(exclusion.index + exclusion[0].length);
  if (
    /^\s+(?:the\s+|a\s+|any\s+)?(?:lid|pan|tray|bowl|machine|processor|blender)\b/i.test(
      tail,
    )
  )
    return false;
  return !/\b(?:add|use|include|mix|stir|cook|fry|roast|serve|return|pour|fold|sprinkle|season|blitz|combine|toss)\b/i.test(
    tail,
  );
}
