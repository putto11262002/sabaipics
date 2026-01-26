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
import { Copy, ExternalLink, Download } from 'lucide-react';

import { useParams } from 'react-router';
import QRCodeSVG from 'react-qr-code';
import { useEvent } from '../../../../hooks/events/useEvent';
import { useCopyToClipboard } from '../../../../hooks/use-copy-to-clipboard';
import { useDownloadQR } from '../../../../hooks/events/useDownloadQR';

export default function EventDetailsTab() {
  const { id } = useParams<{ id: string }>();
  const { data } = useEvent(id);
  const { copyToClipboard } = useCopyToClipboard();
  const downloadQR = useDownloadQR();

  if (!data?.data) {
    return null;
  }

  const event = data.data;

  const searchUrl = `${window.location.origin}/participant/events/${event.id}/search`;

  const handleCopyLink = (eventId: string) => {
    copyToClipboard(`${window.location.origin}/participant/events/${eventId}/search`);
  };

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
            <CardDescription>Credentials will appear once enabled.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Username</p>
              <InputGroup>
                <InputGroupInput readOnly placeholder="Coming soon" />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label="Copy username"
                    title="Copy username"
                    size="icon-xs"
                    disabled
                  >
                    <Copy />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Password</p>
              <InputGroup>
                <InputGroupInput readOnly placeholder="Coming soon" />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label="Copy password"
                    title="Copy password"
                    size="icon-xs"
                    disabled
                  >
                    <Copy />
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
