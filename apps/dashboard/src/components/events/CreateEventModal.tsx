import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@sabaipics/uiv3/components/dialog";
import { Button } from "@sabaipics/uiv3/components/button";
import { Input } from "@sabaipics/uiv3/components/input";
import { Alert } from "@sabaipics/uiv3/components/alert";
import { Spinner } from "@sabaipics/uiv3/components/spinner";
import { eventFormSchema, type EventFormData } from "../../lib/event-form-schema";
import { useCreateEvent } from "../../hooks/events/useCreateEvent";

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
      name: "",
      startDate: "",
      endDate: "",
    },
  });

  const onSubmit = async (data: EventFormData) => {
    setApiError(null);

    try {
      const payload = {
        name: data.name,
        startDate: data.startDate && data.startDate !== "" ? data.startDate : undefined,
        endDate: data.endDate && data.endDate !== "" ? data.endDate : undefined,
      };

      await createEvent.mutateAsync(payload);

      // Success - close modal and reset form
      form.reset();
      onOpenChange(false);
    } catch (error) {
      console.error("Create event error:", error);
      setApiError(error instanceof Error ? error.message : "Failed to create event. Please try again.");
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

        <form id="create-event-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Name Field */}
          <div className="space-y-2">
            <label htmlFor="event-name" className="text-sm font-medium">
              Event Name <span className="text-destructive">*</span>
            </label>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <div className="space-y-1">
                  <Input
                    {...field}
                    id="event-name"
                    placeholder="Wedding 2026"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.error && (
                    <p className="text-sm text-destructive">{fieldState.error.message}</p>
                  )}
                </div>
              )}
            />
          </div>

          {/* Start Date Field */}
          <div className="space-y-2">
            <label htmlFor="start-date" className="text-sm font-medium">
              Start Date <span className="text-muted-foreground">(optional)</span>
            </label>
            <Controller
              name="startDate"
              control={form.control}
              render={({ field, fieldState }) => (
                <div className="space-y-1">
                  <Input
                    {...field}
                    id="start-date"
                    type="datetime-local"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.error && (
                    <p className="text-sm text-destructive">{fieldState.error.message}</p>
                  )}
                </div>
              )}
            />
          </div>

          {/* End Date Field */}
          <div className="space-y-2">
            <label htmlFor="end-date" className="text-sm font-medium">
              End Date <span className="text-muted-foreground">(optional)</span>
            </label>
            <Controller
              name="endDate"
              control={form.control}
              render={({ field, fieldState }) => (
                <div className="space-y-1">
                  <Input
                    {...field}
                    id="end-date"
                    type="datetime-local"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.error && (
                    <p className="text-sm text-destructive">{fieldState.error.message}</p>
                  )}
                </div>
              )}
            />
          </div>

          {/* API Error */}
          {apiError && (
            <Alert variant="destructive">
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
          <Button
            type="submit"
            form="create-event-form"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting && <Spinner className="mr-2 size-4" />}
            Create Event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
