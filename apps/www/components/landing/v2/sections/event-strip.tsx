export function EventStrip() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-16">
      <div className="grid items-end gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="max-w-xl">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Built for real events
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Weddings, concerts, marathons, corporate events, photobooths.
          </p>
        </div>
        <div className="rounded-2xl bg-muted/60 p-6">
          <div className="h-44 w-full rounded-xl bg-muted" aria-hidden="true" />
          <p className="mt-4 text-xs text-muted-foreground">
            Placeholder: editorial monochrome event strip illustration.
          </p>
        </div>
      </div>
    </section>
  );
}
