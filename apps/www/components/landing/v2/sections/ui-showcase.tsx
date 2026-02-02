import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function UiShowcase() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16">
      <div className="max-w-2xl">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">A calm, practical UI</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Lightweight UI mockups based on real components (no screenshots yet).
        </p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4">
            <CardTitle className="text-sm">Upload session</CardTitle>
            <Badge variant="secondary">Uploading</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg bg-muted/60 p-3">
              <p className="text-xs text-muted-foreground">Event</p>
              <p className="mt-0.5 text-sm font-medium">Wedding - 2026-02-02</p>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">DSC_1023.jpg</p>
                <p className="text-xs text-muted-foreground">78%</p>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                <div className="h-1.5 w-[78%] rounded-full bg-foreground/70" />
              </div>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">DSC_1024.jpg</p>
                <p className="text-xs text-muted-foreground">Queued</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button size="sm" variant="outline">
              Pause
            </Button>
            <Button size="sm">View gallery</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Find photos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input placeholder="Search by name / tag" />
              <Button size="sm" variant="outline">
                Search
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-muted" aria-hidden="true" />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Placeholder: gallery tiles (later replaced by real UI + data).
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
