import { Button } from '@sabaipics/uiv3/components/button';
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
import { Check, Copy, ExternalLink, Download, Eye, EyeOff } from 'lucide-react';

import { useState } from 'react';
import { useParams } from 'react-router';
import QRCodeSVG from 'react-qr-code';
import { useEvent } from '../../../../hooks/events/useEvent';
import { useCopyToClipboard } from '../../../../hooks/use-copy-to-clipboard';
import { useDownloadQR } from '../../../../hooks/events/useDownloadQR';
import {
  useFtpCredentials,
  useRevealFtpCredentials,
} from '../../../../hooks/events/useFtpCredentials';

export default function EventDetailsTab() {
  const { id } = useParams<{ id: string }>();
  const { data } = useEvent(id);
  const { copyToClipboard } = useCopyToClipboard();
  const downloadQR = useDownloadQR();
  const ftpCredentials = useFtpCredentials(id);
  const revealCredentials = useRevealFtpCredentials(id);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [isUsernameCopied, setIsUsernameCopied] = useState(false);
  const [isPasswordCopied, setIsPasswordCopied] = useState(false);

  if (!data?.data) {
    return null;
  }

  const event = data.data;

  const searchUrl = `${window.location.origin}/participant/events/${event.id}/search`;

  const handleCopyLink = (eventId: string) => {
    copyToClipboard(`${window.location.origin}/participant/events/${eventId}/search`);
  };

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
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="text-sm">{event.name}</p>
            </div>
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
