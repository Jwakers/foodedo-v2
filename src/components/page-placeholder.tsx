export function PagePlaceholder({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <main className="mx-auto w-full max-w-[700px] px-page-inline py-12 sm:px-8 sm:py-16">
      <p className="text-12 font-bold tracking-overline text-cadmium uppercase">
        {eyebrow}
      </p>
      <h1 className="mt-2 font-display text-42 font-semibold tracking-display text-ink">
        {title}
      </h1>
      <p className="mt-5 max-w-lg text-16 leading-relaxed text-graphite">
        This route is intentionally clear while its new experience is designed.
      </p>
    </main>
  );
}
