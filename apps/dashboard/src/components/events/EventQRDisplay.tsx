import { useState } from "react";
import QRCodeSVG from "react-qr-code";
import { Card, CardHeader, CardTitle, CardContent } from "@sabaipics/ui/components/card";
import { Button } from "@sabaipics/ui/components/button";
import { Input } from "@sabaipics/ui/components/input";
import { Alert } from "@sabaipics/ui/components/alert";
import { Copy, Check } from "lucide-react";
import { useCopyToClipboard } from "../../hooks/use-copy-to-clipboard";
import type { Event } from "../../hooks/events/useEvents";

type QRSize = "small" | "medium" | "large";

interface EventQRDisplayProps {
  event: Event;
}

export function EventQRDisplay({ event }: EventQRDisplayProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const { isCopied: isSearchCopied, copyToClipboard: copySearch } = useCopyToClipboard();
  const { isCopied: isSlideshowCopied, copyToClipboard: copySlideshow } = useCopyToClipboard();

  const searchUrl = `https://sabaipics.com/search/${event.accessCode}`;
  const slideshowUrl = `https://sabaipics.com/event/${event.accessCode}/slideshow`;

  const handleDownload = async (size: QRSize) => {
    setIsDownloading(true);
    setDownloadError(null);

    try {
      const response = await fetch(`/api/events/${event.id}/qr-download?size=${size}`);
      if (!response.ok) {
        throw new Error("Failed to fetch QR code");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${event.name.replace(/[^a-z0-9]/gi, "-")}-${size}-qr.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      setDownloadError("Failed to download QR code. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>QR Code & Links</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* QR Code Display - Client-side generation */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-full max-w-[400px]">
            <QRCodeSVG
              value={searchUrl}
              level="M"
              style={{ width: '100%', maxWidth: '400px', height: 'auto' }}
            />
          </div>

          {/* Download with size selection */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex gap-2">
              {(["small", "medium", "large"] as QRSize[]).map((size) => (
                <Button
                  key={size}
                  onClick={() => handleDownload(size)}
                  disabled={isDownloading}
                  variant={size === "medium" ? "default" : "outline"}
                  size="sm"
                >
                  {size === "small" && "Small (256px)"}
                  {size === "medium" && "Medium (512px)"}
                  {size === "large" && "Large (1200px)"}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Small for sharing, Medium for general use, Large for print
            </p>
          </div>

          {downloadError && (
            <Alert variant="destructive">
              <p>{downloadError}</p>
            </Alert>
          )}
        </div>

        {/* Access Code */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Access Code</label>
          <div className="font-mono text-2xl font-bold">{event.accessCode}</div>
        </div>

        {/* Search URL */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Search URL</label>
          <div className="flex gap-2">
            <Input value={searchUrl} readOnly className="flex-1" />
            <Button
              onClick={() => copySearch(searchUrl)}
              variant="outline"
              size="icon"
              aria-label="Copy search URL"
            >
              {isSearchCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        </div>

        {/* Slideshow URL */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Slideshow URL</label>
          <div className="flex gap-2">
            <Input value={slideshowUrl} readOnly className="flex-1" />
            <Button
              onClick={() => copySlideshow(slideshowUrl)}
              variant="outline"
              size="icon"
              aria-label="Copy slideshow URL"
            >
              {isSlideshowCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
