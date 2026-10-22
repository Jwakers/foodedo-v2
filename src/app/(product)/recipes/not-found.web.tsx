import Link from "next/link";

export default function RecipeNotFound() {
  return (
    <main
      id="editorial-content"
      className="mx-auto w-full max-w-175 px-page-inline py-16"
    >
      <h1 className="font-display text-34 font-semibold tracking-heading">
        Recipe not found
      </h1>
      <p className="mt-4 text-18 leading-7 text-graphite">
        This recipe is no longer available. Find another dinner in the
        collection.
      </p>
      <Link
        href="/recipes"
        className="mt-6 inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Browse recipes
      </Link>
    </main>
  );
}
