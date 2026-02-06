import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@sabaipics/uiv3/components/button';
import { Input } from '@sabaipics/uiv3/components/input';
import { Field, FieldLabel, FieldError } from '@sabaipics/uiv3/components/field';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@sabaipics/uiv3/components/alert';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@sabaipics/uiv3/components/card';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@sabaipics/uiv3/components/input-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sabaipics/uiv3/components/dropdown-menu';
import { Check, Copy, ExternalLink, Download, Save, Upload, X, Image as ImageIcon, Info, Loader2, Eye, EyeOff } from 'lucide-react';

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
import { useFtpCredentials, useRevealFtpCredentials } from '../../../../hooks/events/useFtpCredentials';
import { updateEventFormSchema, type UpdateEventFormData } from '../../../../lib/event-form-schema';
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

  // FTP credentials state
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [isUsernameCopied, setIsUsernameCopied] = useState(false);
  const [isPasswordCopied, setIsPasswordCopied] = useState(false);

  // Hooks
  const presign = useLogoPresign();
  const deleteLogo = useDeleteLogo();
  const logoStatus = useLogoStatus({ eventId: id!, uploadId });
  const ftpCredentials = useFtpCredentials(id);
  const revealCredentials = useRevealFtpCredentials(id);
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

    if (logoStatus.data.status === 'completed') {
      if (logoStatus.data.logoUrl) {
        setLogoPreviewUrl(logoStatus.data.logoUrl);
      }
      setUploadId(null);
      setIsUploading(false);
      queryClient.invalidateQueries({ queryKey: ['event', id] });
      toast.success('Logo uploaded successfully');
    } else if (logoStatus.data.status === 'failed') {
      setUploadError(logoStatus.data.errorMessage || 'Logo processing failed');
      setUploadId(null);
      setIsUploading(false);
      setLogoPreviewUrl(serverLogoUrl);
    }
  }, [logoStatus.data, id, queryClient, serverLogoUrl]);

  const handleFileSelect = useCallback(
    async (file: File) => {
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

      try {
        const { putUrl, uploadId: newUploadId, requiredHeaders } =
          await presign.mutateAsync({ eventId: id!, file });

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
        toast.error(err.message || 'Failed to delete logo');
      },
    });
  }, [id, deleteLogo]);

  const handleCopyUsername = async () => {
    if (!ftpCredentials.data?.username) {
      return;
    }

    const ok = await copyToClipboard(ftpCredentials.data.username);
    if (!ok) {
      return;
    }

    setIsUsernameCopied(true);
    setTimeout(() => setIsUsernameCopied(false), 2000);
  };

  const handleRevealPassword = async () => {
    if (!isPasswordVisible) {
      const result = await revealCredentials.mutateAsync();
      setRevealedPassword(result.password);
      setIsPasswordVisible(true);
      return;
    }

    setIsPasswordVisible(false);
  };

  const handleCopyPassword = async () => {
    if (!revealedPassword) {
      return;
    }

    const ok = await copyToClipboard(revealedPassword);
    if (!ok) {
      return;
    }

    setIsPasswordCopied(true);
    setTimeout(() => setIsPasswordCopied(false), 2000);
  };

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
          toast.error(error.message || 'Failed to update event');
        },
      },
    );
  };

  const searchUrl = `${window.location.origin}/participant/events/${event.id}/search`;

  const handleCopyLink = (eventId: string) => {
    copyToClipboard(`${window.location.origin}/participant/events/${eventId}/search`);
  };
  const passwordValue = isPasswordVisible
    ? (revealedPassword ?? '')
    : (revealedPassword ?? (ftpCredentials.data?.username ? '************' : ''));

  const passwordPlaceholder =
    isPasswordVisible && revealCredentials.isPending
      ? 'Loading...'
      : !ftpCredentials.data?.username
        ? 'Not available'
        : '';

  return (
    <div className="grid gap-4 py-4 lg:grid-cols-[1fr_auto]">
      {/* Left column - Info */}
      <div className="space-y-4">
        {/* Event details */}
        <Card>
          <CardHeader>
            <CardTitle>Event details</CardTitle>
            <CardAction>
              <Button variant="outline" size="sm" onClick={form.handleSubmit(handleSave)} disabled={updateEvent.isPending}>
                <Save className="mr-1 size-4" />
                <span className="hidden sm:inline">Save</span>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-3">
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="event-name">Name</FieldLabel>
                  <Input
                    {...field}
                    id="event-name"
                    placeholder="Event name"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
                </Field>
              )}
            />
            <Controller
              name="subtitle"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="event-subtitle">Subtitle</FieldLabel>
                  <Input
                    {...field}
                    id="event-subtitle"
                    placeholder="Add a tagline or slogan..."
                    aria-invalid={fieldState.invalid}
                  />
                   <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
                </Field>
              )}
            />
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="text-sm">{new Date(event.createdAt).toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Expires</p>
              <p className="text-sm">{new Date(event.expiresAt).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        {/* Event Logo */}
        <Card>
          <CardHeader>
            <CardTitle>Event logo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {logoPreviewUrl ? (
              <div className="space-y-3">
                <div className="relative flex size-48 items-center justify-center rounded-lg border bg-muted">
                  <img
                    src={logoPreviewUrl}
                    alt="Event logo"
                    className="h-full w-full object-contain"
                  />
                  {logoLoading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/60">
                      <Loader2 className="size-8 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={logoLoading}
                  >
                    <Upload className="mr-1 size-4" />
                    Change Logo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteLogo}
                    disabled={logoLoading}
                  >
                    <X className="mr-1 size-4" />
                    Delete
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="flex size-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors hover:border-primary/50 hover:bg-muted/50"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoLoading}
              >
                {logoLoading ? (
                  <Loader2 className="mb-2 size-8 animate-spin text-muted-foreground" />
                ) : (
                  <ImageIcon className="mb-2 size-8 text-muted-foreground" />
                )}
                <p className="text-sm font-medium">Upload logo</p>
                <p className="text-xs text-muted-foreground">Click to browse</p>
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
              <Alert variant="destructive">
                <AlertTitle>Upload error</AlertTitle>
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            )}

            <Alert>
              <Info className="size-4" />
              <AlertTitle>Upload guidelines</AlertTitle>
              <AlertDescription>
                <p className="text-xs">
                  Formats: JPEG, PNG, WebP<br />
                  Maximum size: 5MB<br />
                  Recommended size: 512x512px
                </p>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Event links */}
        <Card>
          <CardHeader>
            <CardTitle>Event links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Slideshow link</p>
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
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Face search link</p>
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
            </div>
          </CardContent>
        </Card>

        {/* FTP credentials */}
        <Card>
          <CardHeader>
            <CardTitle>FTP credentials</CardTitle>
            <CardDescription>Use these credentials to upload photos via FTP.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Username</p>
              <InputGroup>
                <InputGroupInput
                  readOnly
                  value={ftpCredentials.data?.username ?? 'Not available'}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label={isUsernameCopied ? 'Copied username' : 'Copy username'}
                    title={isUsernameCopied ? 'Copied!' : 'Copy username'}
                    size="icon-xs"
                    onClick={handleCopyUsername}
                    disabled={!ftpCredentials.data?.username}
                  >
                    {isUsernameCopied ? <Check /> : <Copy />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Password</p>
              <InputGroup>
                <InputGroupInput
                  readOnly
                  type={isPasswordVisible ? 'text' : 'password'}
                  value={passwordValue}
                  placeholder={passwordPlaceholder}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label={isPasswordVisible ? 'Hide password' : 'Reveal password'}
                    title={isPasswordVisible ? 'Hide password' : 'Reveal password'}
                    size="icon-xs"
                    onClick={handleRevealPassword}
                    disabled={!ftpCredentials.data?.username || revealCredentials.isPending}
                  >
                    {isPasswordVisible ? <EyeOff /> : <Eye />}
                  </InputGroupButton>
                  <InputGroupButton
                    aria-label={isPasswordCopied ? 'Copied password' : 'Copy password'}
                    title={isPasswordCopied ? 'Copied!' : 'Copy password'}
                    size="icon-xs"
                    onClick={handleCopyPassword}
                    disabled={!revealedPassword}
                  >
                    {isPasswordCopied ? <Check /> : <Copy />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right column - QR Code */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>QR code</CardTitle>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={downloadQR.isPending} variant="ghost" size="icon">
                  <Download className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() =>
                    downloadQR.mutate({ eventId: event.id, eventName: event.name, size: 'small' })
                  }
                >
                  <div className="flex flex-col">
                    <span className="font-medium">Small</span>
                    <span className="text-xs text-muted-foreground">256px - Mobile sharing</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    downloadQR.mutate({ eventId: event.id, eventName: event.name, size: 'medium' })
                  }
                >
                  <div className="flex flex-col">
                    <span className="font-medium">Medium</span>
                    <span className="text-xs text-muted-foreground">512px - General use</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    downloadQR.mutate({ eventId: event.id, eventName: event.name, size: 'large' })
                  }
                >
                  <div className="flex flex-col">
                    <span className="font-medium">Large</span>
                    <span className="text-xs text-muted-foreground">1200px - Print quality</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-muted p-6 lg:h-64 lg:w-64">
            <QRCodeSVG value={searchUrl} level="M" style={{ height: '100%', width: 'auto' }} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
