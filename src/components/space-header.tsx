import type { ReactNode } from "react";

/** Shared Week/Shopping layout; controls keep their own behaviour and state. */
export function SpaceHeader({
  headingId,
  title,
  summary,
  context,
  action,
}: {
  headingId: string;
  title: string;
  summary: ReactNode;
  context?: ReactNode;
  action?: ReactNode;
}) {
  const summaryId = `${headingId}-summary`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 min-[360px]:gap-y-0">
      <h1
        id={headingId}
        aria-describedby={summaryId}
        className="col-span-2 col-start-1 row-start-1 flex min-h-11 min-w-0 items-center font-display text-30 font-semibold leading-9 tracking-title text-ink min-[360px]:col-span-1"
      >
        {title}
      </h1>
      <div
        id={summaryId}
        className="col-span-2 col-start-1 row-start-2 min-w-0 min-[360px]:col-span-1"
      >
        {summary}
      </div>
      {context ? (
        <div className="col-start-1 row-start-3 min-[360px]:col-start-2 min-[360px]:row-start-1 min-[360px]:justify-self-end">
          {context}
        </div>
      ) : null}
      {action ? (
        <div className="col-start-2 row-start-3 justify-self-end min-[360px]:row-start-2">
          {action}
        </div>
      ) : null}
    </div>
  );
}
