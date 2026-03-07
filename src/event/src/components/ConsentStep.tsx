import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { th } from '../lib/i18n';

interface ConsentStepProps {
  eventName: string | undefined;
  isLoading: boolean;
  onContinue: () => void;
}

export function ConsentStep({ eventName, isLoading, onContinue }: ConsentStepProps) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        {/* Event Name */}
        <div className="text-center">
          {isLoading ? (
            <Skeleton className="mx-auto h-8 w-48" />
          ) : (
            <h1 className="text-2xl font-bold tracking-tight">{eventName}</h1>
          )}
        </div>

        {/* Title & Description */}
        <div className="space-y-3 text-center">
          <h2 className="text-lg">{th.consent.title}</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">{th.consent.description}</p>
        </div>

        {/* Consent Checkbox with Privacy Policy Link */}
        <label
          htmlFor="consent"
          className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:bg-accent/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
        >
          <Checkbox
            id="consent"
            checked={accepted}
            onCheckedChange={(checked) => setAccepted(checked === true)}
            className="mt-0.5 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
          />
          <span className="text-sm leading-relaxed">
            <span className="text-muted-foreground">{th.consent.checkboxPrefix} </span>
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
              onClick={(e) => e.stopPropagation()}
            >
              {th.consent.privacyPolicy}
            </a>
          </span>
        </label>

        {/* Continue Button */}
        <Button size="lg" className="w-full" disabled={!accepted || isLoading} onClick={onContinue}>
          {th.consent.button}
        </Button>
      </div>
    </div>
  );
}
