import { Card } from '@/components/ui/card';

export function FlowMap() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-16">
      <div className="max-w-2xl">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          A simple workflow that fits real events
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Shoot or edit the way you already do. Upload in the method that fits. Share once.
        </p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl bg-muted/60 p-6">
          <div className="h-64 w-full rounded-xl bg-muted" aria-hidden="true" />
          <p className="mt-4 text-xs text-muted-foreground">
            Placeholder: workflow map illustration (camera/iOS, browser, desktop, Lightroom to
            SabaiPics to attendees).
          </p>
        </div>

        <div className="grid gap-4">
          <Card className="p-5">
            <p className="text-sm font-medium">1) Upload</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose iOS WiFi, browser, desktop uploader, or Lightroom.
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-sm font-medium">2) Share</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use QR or share via LINE so attendees can access instantly.
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-sm font-medium">3) Find & download</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Face search helps people find their photos fast.
            </p>
          </Card>
        </div>
      </div>
    </section>
  );
}
