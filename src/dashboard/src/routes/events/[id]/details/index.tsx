import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldError,
} from '@/shared/components/ui/field';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import { Separator } from '@/shared/components/ui/separator';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/shared/components/ui/input-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Copy, ExternalLink, Download, Upload, X, Image as ImageIcon } from 'lucide-react';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import QRCodeSVG from 'react-qr-code';
import { useEvent } from '../../../../hooks/events/useEvent';
import { useCopyToClipboard } from '../../../../hooks/use-copy-to-clipboard';
import { useDownloadQR } from '../../../../hooks/events/useDownloadQR';
import { useUpdateEvent } from '../../../../hooks/events/useUpdateEvent';
import { useLogoPresign } from '../../../../hooks/events/useLogoPresign';
import { useLogoStatus } from '../../../../hooks/events/useLogoStatus';
import { useDeleteLogo } from '../../../../hooks/events/useDeleteLogo';
import { updateEventFormSchema, type UpdateEventFormData } from '../../../../lib/event-form-schema';
import { Spinner } from '@/shared/components/ui/spinner';
import { toast } from 'sonner';

const ALLOWED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 MB

export default function EventDetailsTab() {
  const { id } = useParams<{ id: string }>();
  const { data } = useEvent(id);
  const { copyToClipboard } = useCopyToClipboard();
  const downloadQR = useDownloadQR();
  const queryClient = useQueryClient();

  // Logo upload state
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hooks
  const presign = useLogoPresign();
  const deleteLogo = useDeleteLogo();
  const logoStatus = useLogoStatus({ eventId: id!, uploadId });
  const updateEvent = useUpdateEvent();

  // Sync logoPreviewUrl from server data when it changes
  const event = data?.data;
  const serverLogoUrl = event?.logoUrl ?? null;
  const prevServerLogoUrlRef = useRef(serverLogoUrl);
  useEffect(() => {
    if (serverLogoUrl !== prevServerLogoUrlRef.current) {
      prevServerLogoUrlRef.current = serverLogoUrl;
      setLogoPreviewUrl(serverLogoUrl);
    }
  }, [serverLogoUrl]);

  // Initialize logoPreviewUrl on first render
  useEffect(() => {
    if (serverLogoUrl && !logoPreviewUrl && !uploadId) {
      setLogoPreviewUrl(serverLogoUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverLogoUrl]);

  // Watch logo processing status
  useEffect(() => {
    if (!logoStatus.data) return;

    if (logoStatus.data.data.status === 'completed') {
      if (logoStatus.data.data.logoUrl) {
        setLogoPreviewUrl(logoStatus.data.data.logoUrl);
      }
      setUploadId(null);
      setIsUploading(false);
      queryClient.invalidateQueries({ queryKey: ['events', 'detail', id] });
      toast.success('Logo uploaded successfully');
    } else if (logoStatus.data.data.status === 'failed') {
      setUploadError(logoStatus.data.data.errorMessage || 'Logo processing failed');
      setUploadId(null);
      setIsUploading(false);
      setLogoPreviewUrl(serverLogoUrl);
    }
  }, [logoStatus.data, id, queryClient, serverLogoUrl]);

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
        setUploadError('Invalid file type. Please use JPEG, PNG, or WebP.');
        return;
      }
      if (file.size > MAX_LOGO_SIZE) {
        setUploadError('File is too large. Maximum size is 5MB.');
        return;
      }

      setUploadError(null);
      setIsUploading(true);
      setLogoPreviewUrl(URL.createObjectURL(file));

      presign.mutate(
        { eventId: id!, file },
        {
          onSuccess: async ({ data: { putUrl, uploadId: newUploadId, requiredHeaders } }) => {
            try {
              await fetch(putUrl, {
                method: 'PUT',
                body: file,
                headers: requiredHeaders,
              });
              setUploadId(newUploadId);
            } catch (err) {
              setIsUploading(false);
              setLogoPreviewUrl(serverLogoUrl);
              setUploadError(err instanceof Error ? err.message : 'Upload failed');
            }
          },
          onError: (err) => {
            setIsUploading(false);
            setLogoPreviewUrl(serverLogoUrl);
            setUploadError(err.message);
          },
        },
      );
    },
    [id, presign, serverLogoUrl],
  );

  const handleDeleteLogo = useCallback(() => {
    if (!id) return;
    deleteLogo.mutate(id, {
      onSuccess: () => {
        setLogoPreviewUrl(null);
        toast.success('Logo deleted');
      },
      onError: (err) => {
        toast.error(err.message);
      },
    });
  }, [id, deleteLogo]);

  if (!event) {
    return null;
  }

  const form = useForm<UpdateEventFormData>({
    resolver: zodResolver(updateEventFormSchema),
    defaultValues: {
      name: event.name,
      subtitle: event.subtitle || '',
    },
  });

  const logoLoading = isUploading || deleteLogo.isPending;

  const handleSave = () => {
    updateEvent.mutate(
      { id: event.id, ...form.watch() },
      {
        onSuccess: () => {
          toast.success('Event details updated');
        },
        onError: (error) => {
          console.error('Failed to update event:', error);
          toast.error(error.message);
        },
      },
    );
  };

  const searchUrl = `${import.meta.env.VITE_EVENT_URL}/participant/events/${event.id}/search`;

  const handleCopyLink = (eventId: string) => {
    copyToClipboard(`${import.meta.env.VITE_EVENT_URL}/participant/events/${eventId}/search`);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      {/* Event details */}
      <section className="space-y-4">
        <h2 className="text-base font-medium">Event details</h2>
        <FieldGroup>
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field orientation="responsive" data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="event-name">Name</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="event-name"
                    placeholder="Event name"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            name="subtitle"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field orientation="responsive" data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="event-subtitle">Subtitle</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="event-subtitle"
                    placeholder="Add a tagline or slogan..."
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
                </FieldContent>
              </Field>
            )}
          />
          <Field orientation="responsive">
            <FieldLabel>Created</FieldLabel>
            <p className="text-sm">{new Date(event.createdAt).toLocaleString()}</p>
          </Field>
          <Field orientation="responsive">
            <FieldLabel>Expires</FieldLabel>
            <p className="text-sm">{new Date(event.expiresAt).toLocaleString()}</p>
          </Field>
        </FieldGroup>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={form.handleSubmit(handleSave)}
            disabled={updateEvent.isPending}
          >
            {updateEvent.isPending && <Spinner className="mr-1 size-3" />}
            Save
          </Button>
        </div>
      </section>

      <Separator />

      {/* Event links & QR code */}
      <section className="space-y-4">
        <h2 className="text-base font-medium">Event links</h2>
        <FieldGroup>
          <Field orientation="responsive">
            <FieldLabel>QR code</FieldLabel>
            <FieldContent>
              <div className="relative w-fit rounded-xl bg-muted p-4">
                <QRCodeSVG value={searchUrl} level="M" className="size-32" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      disabled={downloadQR.isPending}
                      variant="outline"
                      size="icon-xs"
                      className="absolute right-1 top-1 bg-background"
                    >
                      <Download className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={() =>
                        downloadQR.mutate(
                          { eventId: event.id, eventName: event.name, size: 'small' },
                          { onError: (e) => toast.error(e.message) },
                        )
                      }
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">Small</span>
                        <span className="text-xs text-muted-foreground">
                          256px - Mobile sharing
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        downloadQR.mutate(
                          { eventId: event.id, eventName: event.name, size: 'medium' },
                          { onError: (e) => toast.error(e.message) },
                        )
                      }
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">Medium</span>
                        <span className="text-xs text-muted-foreground">512px - General use</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        downloadQR.mutate(
                          { eventId: event.id, eventName: event.name, size: 'large' },
                          { onError: (e) => toast.error(e.message) },
                        )
                      }
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">Large</span>
                        <span className="text-xs text-muted-foreground">
                          1200px - Print quality
                        </span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>Slideshow link</FieldLabel>
            <InputGroup>
              <InputGroupInput readOnly placeholder="Coming soon" />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label="Copy slideshow link"
                  title="Copy slideshow link"
                  size="icon-xs"
                  disabled
                >
                  <Copy />
                </InputGroupButton>
                <InputGroupButton
                  size="icon-xs"
                  aria-label="Open slideshow link"
                  title="Open slideshow link"
                  disabled
                >
                  <ExternalLink />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel>Face search link</FieldLabel>
            <InputGroup>
              <InputGroupInput readOnly value={searchUrl} />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label="Copy search link"
                  title="Copy search link"
                  size="icon-xs"
                  onClick={() => handleCopyLink(event.id)}
                >
                  <Copy />
                </InputGroupButton>
                <InputGroupButton
                  asChild
                  size="icon-xs"
                  aria-label="Open search link"
                  title="Open search link"
                >
                  <a href={searchUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink />
                  </a>
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </FieldGroup>
      </section>

      <Separator />

      {/* Event logo */}
      <section className="space-y-4">
        <h2 className="text-base font-medium">Event logo</h2>
        <FieldGroup>
          <Field orientation="responsive">
            <FieldLabel>Logo</FieldLabel>
            <FieldContent>
              {logoPreviewUrl ? (
                <div className="relative flex aspect-square w-48 items-center justify-center rounded-lg border bg-muted">
                  <img
                    src={logoPreviewUrl}
                    alt="Event logo"
                    className="h-full w-full object-contain"
                  />
                  {logoLoading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/60">
                      <Spinner className="size-8 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="flex aspect-square w-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors hover:border-border hover:bg-muted"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={logoLoading}
                >
                  {logoLoading ? (
                    <Spinner className="mb-2 size-8 text-muted-foreground" />
                  ) : (
                    <ImageIcon className="mb-2 size-8 text-muted-foreground" />
                  )}
                  <p className="text-sm font-medium">Upload logo</p>
                  <p className="text-xs text-muted-foreground">JPEG, PNG, WebP · Max 5MB</p>
                  <p className="text-xs text-muted-foreground">Recommended 512×512px</p>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  e.target.value = '';
                }}
              />

              {uploadError && (
                <Alert variant="destructive" className="mt-3">
                  <AlertTitle>Upload error</AlertTitle>
                  <AlertDescription>{uploadError}</AlertDescription>
                </Alert>
              )}
            </FieldContent>
          </Field>
        </FieldGroup>
        <div className="flex gap-2">
          {logoPreviewUrl ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoLoading}
              >
                <Upload className="mr-1 size-3" />
                Change
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteLogo}
                disabled={logoLoading}
              >
                <X className="mr-1 size-3" />
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
