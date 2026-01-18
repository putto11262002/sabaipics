import { Button } from "@sabaipics/ui/components/button";
import { Badge } from "@sabaipics/ui/components/badge";
import { Input } from "@sabaipics/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@sabaipics/ui/components/input-group";
import { Download, Copy, Presentation, ExternalLink, Calendar, Clock } from "lucide-react";
import { parseISO, differenceInDays } from "date-fns";
import { useParams } from "react-router";
import { useEvent } from "../../../../hooks/events/useEvent";
import { useCopyToClipboard } from "../../../../hooks/use-copy-to-clipboard";

export default function EventDetailsTab() {
  const { id } = useParams<{ id: string }>();
  const { data } = useEvent(id);
  const { copyToClipboard } = useCopyToClipboard();

  if (!data?.data) {
    return null;
  }

  const event = data.data;

  const daysUntilExpiry = differenceInDays(parseISO(event.expiresAt), new Date());
  const isExpired = daysUntilExpiry <= 0;
  const isExpiringSoon = daysUntilExpiry <= 7 && daysUntilExpiry > 0;
  const searchUrl = `${window.location.origin}/search/${event.accessCode}`;
  const slideshowUrl = `${window.location.origin}/slideshow/${event.accessCode}`;

  const handleDownloadQR = async (qrCodeUrl: string, accessCode: string) => {
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `event-qr-${accessCode}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download QR code:", error);
    }
  };

  const handleCopyLink = (accessCode: string) => {
    copyToClipboard(`${window.location.origin}/search/${accessCode}`);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
      <div className="space-y-6">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-muted-foreground">
              Event access
            </p>
            {isExpired ? (
              <Badge variant="destructive" className="text-xs">Expired</Badge>
            ) : isExpiringSoon ? (
              <Badge variant="outline" className="border-orange-500 text-orange-500 text-xs">
                Expires in {daysUntilExpiry}d
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                Active
              </Badge>
            )}
          </div>
          <h2 className="text-2xl font-semibold">{event.name}</h2>
          <p className="text-sm text-muted-foreground">
            Fast-share tools for guests. QR and links are the only things they need.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">QR code</h3>
              {event.qrCodeUrl && (
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handleDownloadQR(event.qrCodeUrl!, event.accessCode)}
                  title="Download QR"
                >
                  <Download className="size-4" />
                </Button>
              )}
            </div>
            {event.qrCodeUrl ? (
              <div className="flex h-72 items-center justify-center rounded-3xl border bg-white p-6 shadow-sm">
                <img
                  src={event.qrCodeUrl}
                  alt="Event QR Code"
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex h-72 items-center justify-center rounded-3xl border bg-muted">
                <p className="text-sm text-muted-foreground">QR Unavailable</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Slideshow preview</h3>
              <div className="flex h-72 items-center justify-center rounded-3xl border bg-muted/60">
                <div className="text-center">
                  <Presentation className="mx-auto mb-2 size-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Preview unavailable</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground">
              Event timeline
            </h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Start</span>
              <span className="ml-auto font-medium">
                {event.startDate ? new Date(event.startDate).toLocaleString() : "Not set"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">End</span>
              <span className="ml-auto font-medium">
                {event.endDate ? new Date(event.endDate).toLocaleString() : "Not set"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Created</span>
              <span className="ml-auto font-medium">
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Expires</span>
              <span className="ml-auto font-medium">
                {new Date(event.expiresAt).toLocaleString()}
              </span>
            </div>
          </div>
          {isExpiringSoon && (
            <p className="text-sm text-destructive">
              Expires in {daysUntilExpiry} day{daysUntilExpiry === 1 ? "" : "s"}.
            </p>
          )}
        </section>
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground">
              FTP access
            </h3>
            <p className="text-xs text-muted-foreground">
              Credentials will appear once enabled.
            </p>
          </div>
          <div className="space-y-4">
            <Input readOnly placeholder="FTP username (coming soon)" />
            <Input readOnly placeholder="FTP password (coming soon)" />
          </div>
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-muted-foreground">Guest links</h4>
            <div className="space-y-4">
              <InputGroup>
                <InputGroupInput readOnly value={searchUrl} />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label="Copy search link"
                    title="Copy search link"
                    size="icon-xs"
                    onClick={() => handleCopyLink(event.accessCode)}
                  >
                    <Copy />
                  </InputGroupButton>
                  <InputGroupButton asChild size="icon-xs" aria-label="Open search link" title="Open search link">
                    <a href={searchUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink />
                    </a>
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <InputGroup>
                <InputGroupInput readOnly value={slideshowUrl} />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label="Copy slideshow link"
                    title="Copy slideshow link"
                    size="icon-xs"
                    onClick={() => copyToClipboard(slideshowUrl)}
                  >
                    <Copy />
                  </InputGroupButton>
                  <InputGroupButton
                    size="icon-xs"
                    aria-label="Open slideshow (coming soon)"
                    title="Open slideshow (coming soon)"
                    disabled
                  >
                    <Presentation />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
