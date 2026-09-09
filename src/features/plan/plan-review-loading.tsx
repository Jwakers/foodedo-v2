export function PlanReviewLoading() {
  return (
    <main
      className="mx-auto w-full max-w-175 px-page-inline pt-4.5 pb-8"
      aria-busy="true"
      aria-label="Loading your week"
    >
      <div className="h-9 w-56 rounded-sm bg-mist" />
      <div className="mt-2 h-5 w-48 rounded-sm bg-mist" />
      <div className="mt-6 h-16 rounded-md bg-mist" />
      <div className="mt-6">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="flex min-h-21.5 items-center gap-2.5 border-b border-border py-2.5"
          >
            <div className="h-12 w-9 rounded-sm bg-mist" />
            <div className="h-16.5 w-20.5 rounded-sm bg-mist" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-36 rounded-sm bg-mist" />
              <div className="h-4 w-24 rounded-sm bg-mist" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
