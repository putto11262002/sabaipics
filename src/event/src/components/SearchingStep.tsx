import { Spinner } from '@/ui-legacy/components/ui/spinner';
import { th } from '../lib/i18n';

export function SearchingStep() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="space-y-6 text-center">
        <Spinner className="mx-auto h-12 w-12" />
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{th.searching.title}</h1>
          <p className="text-sm text-muted-foreground">{th.searching.wait}</p>
        </div>
      </div>
    </div>
  );
}
