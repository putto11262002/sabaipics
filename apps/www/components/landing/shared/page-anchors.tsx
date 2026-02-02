import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function PageAnchors() {
  return (
    <>
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-16">
        <Card className="p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Pay as you go. Start with a real trial.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Free trial includes 1000 photos/credits.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button asChild size="lg">
                <Link href="#">Start free trial</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="#faq">Read FAQ</Link>
              </Button>
            </div>
          </div>
        </Card>
      </section>

      <section id="faq" className="mx-auto max-w-6xl px-4 pb-24">
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">FAQ</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Placeholder: camera compatibility, setup, privacy, accuracy, LINE delivery.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {[
            'Will it work with my camera?',
            'Is setup really plug-and-play?',
            'How do you handle face data?',
            'How accurate is face search?',
          ].map((q) => (
            <Card key={q} className="p-6">
              <p className="text-sm font-semibold tracking-tight">{q}</p>
              <p className="mt-1 text-sm text-muted-foreground">Placeholder answer.</p>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
