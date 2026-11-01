/** Shared by the static view shell, recipe query and private-account check. */
export function RecipeDetailLoading() {
  return (
    <main
      aria-label="Loading recipe"
      aria-busy="true"
      className="mx-auto w-full max-w-175"
    >
      <p role="status" className="sr-only">
        Loading recipe
      </p>
      <div aria-hidden="true">
        <div className="h-67 w-full bg-mist" />
        <div className="flex flex-col gap-2.5 px-page-inline pt-6 pb-5">
          <div className="h-3 w-24 rounded-sm bg-mist" />
          <div className="h-10 w-4/5 rounded-sm bg-mist" />
          <div className="h-10 w-3/5 rounded-sm bg-mist" />
          <div className="mt-2 h-11 w-40 rounded-sm bg-mist" />
          <div className="mt-3 h-4 w-full rounded-sm bg-mist" />
          <div className="h-4 w-4/5 rounded-sm bg-mist" />
          <div className="mt-6 h-7 w-32 rounded-sm bg-mist" />
          <div className="mt-2 h-4 w-3/4 rounded-sm bg-mist" />
          <div className="h-4 w-2/3 rounded-sm bg-mist" />
        </div>
      </div>
    </main>
  );
}
