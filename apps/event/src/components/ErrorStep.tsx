import { AlertCircle, Clock, ServerCrash, SearchX } from 'lucide-react';
import { Button } from '@sabaipics/ui/components/button';
import { Alert, AlertDescription, AlertTitle } from '@sabaipics/ui/components/alert';
import { th } from '@/lib/i18n';

type ErrorType = 'NO_FACE' | 'RATE_LIMITED' | 'NOT_FOUND' | 'SERVER' | null;

interface ErrorStepProps {
  type: ErrorType;
  onRetry: () => void;
}

export function ErrorStep({ type, onRetry }: ErrorStepProps) {
  const getErrorContent = () => {
    switch (type) {
      case 'NO_FACE':
        return {
          icon: AlertCircle,
          title: th.errors.noFace.title,
          description: th.errors.noFace.description,
          tips: th.errors.noFace.tips,
          button: th.errors.noFace.button,
          variant: 'destructive' as const,
        };
      case 'RATE_LIMITED':
        return {
          icon: Clock,
          title: th.errors.rateLimit.title,
          description: th.errors.rateLimit.description,
          tips: null,
          button: null,
          variant: 'default' as const,
        };
      case 'NOT_FOUND':
        return {
          icon: SearchX,
          title: th.errors.notFound.title,
          description: th.errors.notFound.description,
          tips: null,
          button: null,
          variant: 'destructive' as const,
        };
      case 'SERVER':
      default:
        return {
          icon: ServerCrash,
          title: th.errors.server.title,
          description: th.errors.server.description,
          tips: null,
          button: th.errors.server.button,
          variant: 'destructive' as const,
        };
    }
  };

  const content = getErrorContent();
  const Icon = content.icon;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
            <Icon className="h-10 w-10 text-destructive" />
          </div>
        </div>

        {/* Alert */}
        <Alert variant={content.variant}>
          <Icon className="h-4 w-4" />
          <AlertTitle>{content.title}</AlertTitle>
          <AlertDescription>
            <p>{content.description}</p>
            {content.tips && (
              <ul className="mt-2 list-inside list-disc text-sm">
                {content.tips.map((tip, index) => (
                  <li key={index}>{tip}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>

        {/* Retry Button */}
        {content.button && (
          <Button size="lg" className="w-full" onClick={onRetry}>
            {content.button}
          </Button>
        )}
      </div>
    </div>
  );
}
