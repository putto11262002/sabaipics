import { Card } from '@/components/ui/card';

const tiles = [
  {
    title: 'Upload your way',
    description: 'iOS WiFi, browser, desktop, Lightroom auto-export.',
  },
  {
    title: 'Attendee discovery',
    description: 'Face search to reduce scrolling and back-and-forth.',
  },
  {
    title: 'Share fast',
    description: 'QR + LINE-friendly delivery for real-world events.',
  },
  {
    title: 'Branding controls',
    description: 'Watermark and branding to match your studio.',
  },
  {
    title: 'Organizer ready',
    description: 'A polished attendee experience that just works.',
  },
  {
    title: 'Pay as you go',
    description: 'Usage-based pricing designed to feel fair.',
  },
] as const;

export function BentoFeatures() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16">
      <div className="grid gap-4 md:grid-cols-12">
        {tiles.map((tile, idx) => (
          <Card
            key={tile.title}
            className={idx === 0 ? 'md:col-span-6' : idx === 1 ? 'md:col-span-6' : 'md:col-span-4'}
          >
            <div className="p-6">
              <div className="h-10 w-10 rounded-lg bg-muted" aria-hidden="true" />
              <p className="mt-4 text-sm font-semibold tracking-tight">{tile.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{tile.description}</p>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
