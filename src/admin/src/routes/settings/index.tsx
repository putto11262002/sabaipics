import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Switch } from '@/shared/components/ui/switch';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Spinner } from '@/shared/components/ui/spinner';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/shared/components/ui/field';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import { useSettings } from '../../hooks/settings/use-settings';
import { useUpdateSettings } from '../../hooks/settings/use-update-settings';

// =============================================================================
// Form Schema
// =============================================================================

const settingsSchema = z.object({
  signupBonusEnabled: z.boolean(),
  signupBonusCredits: z.coerce.number().int().min(0).max(10000),
  signupBonusCreditExpiresInDays: z.coerce.number().int().min(1).max(365),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

// =============================================================================
// Helpers
// =============================================================================

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// =============================================================================
// Page
// =============================================================================

function SettingsPage() {
  const { data, isLoading, error, refetch } = useSettings();
  const updateSettings = useUpdateSettings();

  const settings = data?.data;

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      signupBonusEnabled: false,
      signupBonusCredits: 0,
      signupBonusCreditExpiresInDays: 180,
    },
  });

  // Sync form with fetched data
  useEffect(() => {
    if (settings) {
      form.reset({
        signupBonusEnabled: settings.signupBonusEnabled,
        signupBonusCredits: settings.signupBonusCredits,
        signupBonusCreditExpiresInDays: settings.signupBonusCreditExpiresInDays,
      });
    }
  }, [settings, form]);

  const bonusEnabled = form.watch('signupBonusEnabled');

  const onSubmit = (values: SettingsFormValues) => {
    updateSettings.mutate(values, {
      onSuccess: () => {
        toast.success('Settings saved');
      },
      onError: (e) => toast.error('Failed to save settings', { description: e.message }),
    });
  };

  return (
    <>
      <SidebarPageHeader breadcrumbs={[{ label: 'Settings' }]} />

      <div className="mx-auto max-w-6xl space-y-6 p-4">
        {/* Error state */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Failed to load settings</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
            <Button
              variant="destructive"
              size="sm"
              className="mt-2"
              onClick={() => refetch()}
            >
              <RefreshCw className="mr-1 size-4" />
              Retry
            </Button>
          </Alert>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-5 w-40" />
            <div className="space-y-5">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        )}

        {/* Settings form */}
        {!isLoading && !error && settings && (
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <section className="space-y-4">
              <div>
                <h2 className="text-base font-medium">Signup Bonus</h2>
                <p className="text-sm text-muted-foreground">
                  Auto-grant free credits to new photographers when they sign up.
                </p>
              </div>

              <FieldGroup>
                <Controller
                  name="signupBonusEnabled"
                  control={form.control}
                  render={({ field }) => (
                    <Field orientation="responsive" align="end">
                      <FieldLabel htmlFor="signupBonusEnabled">
                        <FieldContent>
                          Enable signup bonus
                          <FieldDescription>
                            New users will receive free credits on signup
                          </FieldDescription>
                        </FieldContent>
                      </FieldLabel>
                      <Switch
                        id="signupBonusEnabled"
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked)}
                      />
                    </Field>
                  )}
                />

                {bonusEnabled && (
                  <>
                    <Controller
                      name="signupBonusCredits"
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field orientation="responsive" data-invalid={fieldState.invalid || undefined}>
                          <FieldLabel htmlFor="signupBonusCredits">Credits amount</FieldLabel>
                          <FieldContent>
                            <Input
                              {...field}
                              onChange={(e) => field.onChange(e.target.value)}
                              id="signupBonusCredits"
                              type="number"
                              placeholder="e.g. 100"
                              aria-invalid={fieldState.invalid}
                            />
                            <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
                          </FieldContent>
                        </Field>
                      )}
                    />

                    <Controller
                      name="signupBonusCreditExpiresInDays"
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field orientation="responsive" data-invalid={fieldState.invalid || undefined}>
                          <FieldLabel htmlFor="signupBonusCreditExpiresInDays">Credit expiry (days)</FieldLabel>
                          <FieldContent>
                            <Input
                              {...field}
                              onChange={(e) => field.onChange(e.target.value)}
                              id="signupBonusCreditExpiresInDays"
                              type="number"
                              placeholder="180"
                              aria-invalid={fieldState.invalid}
                            />
                            <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
                          </FieldContent>
                        </Field>
                      )}
                    />
                  </>
                )}
              </FieldGroup>

              <div className="flex items-center gap-4">
                <Button size="sm" type="submit" disabled={updateSettings.isPending || !form.formState.isDirty}>
                  {updateSettings.isPending && <Spinner className="mr-1 size-3" />}
                  Save
                </Button>
                {settings.updatedAt && (
                  <p className="text-xs text-muted-foreground">
                    Last updated {formatDate(settings.updatedAt)}
                    {settings.updatedBy && ` by ${settings.updatedBy}`}
                  </p>
                )}
              </div>
            </section>
          </form>
        )}
      </div>
    </>
  );
}

export { SettingsPage as Component };
