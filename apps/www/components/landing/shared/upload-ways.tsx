import { Card } from '@/components/ui/card';

const ways = [
  {
    title: 'iOS + camera WiFi',
    description: 'Connect and transfer on-site.',
  },
  {
    title: 'Browser upload',
    description: 'Drag & drop quick batches.',
  },
  {
    title: 'Desktop uploader',
    description: 'Stable bulk uploads for big folders.',
  },
  {
    title: 'Lightroom auto-export',
    description: 'Edit as usual; upload continuously.',
  },
] as const;

export function UploadWays() {
  return (
    <section id="upload" className="mx-auto max-w-6xl px-4 pb-16">
      <div className="max-w-2xl">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Upload your way</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Keep your workflow. Choose the upload method that fits the event.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ways.map((way) => (
          <Card key={way.title} className="p-6">
            <div className="h-10 w-10 rounded-lg bg-muted" aria-hidden="true" />
            <p className="mt-4 text-sm font-semibold tracking-tight">{way.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{way.description}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
