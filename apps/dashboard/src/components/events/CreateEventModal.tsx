import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@sabaipics/uiv3/components/dialog';
import { Button } from '@sabaipics/uiv3/components/button';
import { Input } from '@sabaipics/uiv3/components/input';
import { Alert } from '@sabaipics/uiv3/components/alert';
import { Spinner } from '@sabaipics/uiv3/components/spinner';
import { Field, FieldLabel, FieldError } from '@sabaipics/uiv3/components/field';
import { eventFormSchema, type EventFormData } from '../../lib/event-form-schema';
import { useCreateEvent } from '../../hooks/events/useCreateEvent';

interface CreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateEventModal({ open, onOpenChange }: CreateEventModalProps) {
  const createEvent = useCreateEvent();
  const [apiError, setApiError] = useState<string | null>(null);

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = async (data: EventFormData) => {
    setApiError(null);

    try {
      await createEvent.mutateAsync({ name: data.name });

      // Success - close modal and reset form
      form.reset();
      onOpenChange(false);
    } catch (error) {
      console.error('Create event error:', error);
      setApiError(
        error instanceof Error ? error.message : 'Failed to create event. Please try again.',
      );
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form when closing
      form.reset();
      setApiError(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Event</DialogTitle>
        </DialogHeader>

        <form id="create-event-form" onSubmit={form.handleSubmit(onSubmit)}>
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="event-name">Event Name</FieldLabel>
                <Input
                  {...field}
                  id="event-name"
                  placeholder="Wedding 2026"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
              </Field>
            )}
          />

          {/* API Error */}
          {apiError && (
            <Alert variant="destructive" className="mt-4">
              <p>{apiError}</p>
            </Alert>
          )}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={form.formState.isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" form="create-event-form" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Spinner className="mr-1 size-4" />}
            Create Event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
