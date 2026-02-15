import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Alert } from '@/shared/components/ui/alert';
import { Spinner } from '@/shared/components/ui/spinner';
import { Field, FieldLabel, FieldError } from '@/shared/components/ui/field';
import { eventFormSchema, type EventFormData } from '../../lib/event-form-schema';
import { useCreateEvent } from '@/shared/hooks/rq/events/use-create-event';

interface CreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateEventModal({ open, onOpenChange }: CreateEventModalProps) {
  const navigate = useNavigate();
  const createEvent = useCreateEvent();
  const [apiError, setApiError] = useState<string | null>(null);

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = (data: EventFormData) => {
    setApiError(null);

    createEvent.mutate(
      { name: data.name },
      {
        onSuccess: (result) => {
          // Success - close modal, reset form, and navigate to event details
          form.reset();
          onOpenChange(false);
          navigate(`/events/${result.data.id}/details`);
        },
        onError: (error) => {
          console.error('Create event error:', error);
          setApiError(error.message);
        },
      },
    );
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
            disabled={createEvent.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" form="create-event-form" disabled={createEvent.isPending}>
            {createEvent.isPending && <Spinner className="mr-1 size-4" />}
            Create Event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
