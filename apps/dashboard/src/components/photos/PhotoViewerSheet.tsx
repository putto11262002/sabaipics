import { useEffect, useMemo, useState } from 'react';
import { X, Info, ArrowLeft, ArrowRight } from 'lucide-react';

import { Sheet, SheetContent } from '@sabaipics/uiv3/components/sheet';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@sabaipics/uiv3/components/drawer';
import { Separator } from '@sabaipics/uiv3/components/separator';
import { Button } from '@sabaipics/uiv3/components/button';
import { ScrollArea } from '@sabaipics/uiv3/components/scroll-area';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@sabaipics/uiv3/components/carousel';

type ViewerPhoto = {
  id: string;
  previewUrl: string;
  width: number;
  height: number;
  uploadedAt: string;
  fileSize?: number | null;
  faceCount?: number | null;
  // exif?: { ... }  // not currently included in API response
};

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(u === 0 ? 0 : 1)} ${units[u]}`;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xs break-words">{value}</div>
    </div>
  );
}

export function PhotoViewerSheet({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  photos: ViewerPhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const open = index >= 0;
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const current = useMemo(() => (index >= 0 ? photos[index] : null), [index, photos]);

  useEffect(() => {
    if (!open) {
      setInfoOpen(false);
    }
  }, [open]);

  // Keep local index in sync with carousel selection
  useEffect(() => {
    if (!api) return;
    const handleSelect = () => {
      const selected = api.selectedScrollSnap();
      onIndexChange(selected);
    };
    api.on('select', handleSelect);
    return () => {
      api.off('select', handleSelect);
    };
  }, [api, onIndexChange]);

  // When opened or index changes externally, scroll carousel to it
  useEffect(() => {
    if (!api) return;
    if (!open) return;
    api.scrollTo(index, true);
  }, [api, open, index]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="data-[side=bottom]:inset-0 data-[side=bottom]:h-dvh data-[side=bottom]:max-h-dvh data-[side=bottom]:border-0 data-[side=bottom]:p-0"
      >
        <div className="flex h-dvh flex-col bg-background">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="size-4" />
              </Button>
              <div className="text-xs text-muted-foreground">
                {index + 1} / {photos.length}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setInfoOpen(true)}
                disabled={!current}
                title="Info"
              >
                <Info className="size-4" />
              </Button>
            </div>
          </div>
          <Separator />

          <div className="relative flex flex-1 items-center justify-center bg-black">
            <Carousel
              className="w-full h-full"
              opts={{ startIndex: Math.max(index, 0), loop: false }}
              setApi={setApi}
            >
              <CarouselContent className="h-full">
                {photos.map((p) => (
                  <CarouselItem key={p.id} className="h-full">
                    <div className="flex h-full w-full items-center justify-center">
                      <img
                        src={p.previewUrl}
                        alt="Photo"
                        className="h-full w-full object-contain"
                        draggable={false}
                      />
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>

              <div className="hidden md:block">
                <CarouselPrevious className="left-4 top-1/2 -translate-y-1/2" />
                <CarouselNext className="right-4 top-1/2 -translate-y-1/2" />
              </div>
            </Carousel>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 to-transparent" />
          </div>

          <div className="flex items-center justify-between px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => api?.scrollPrev()}
              disabled={!api?.canScrollPrev()}
            >
              <ArrowLeft className="mr-2 size-4" />
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => api?.scrollNext()}
              disabled={!api?.canScrollNext()}
            >
              Next
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
        </div>

        <Drawer open={infoOpen} onOpenChange={setInfoOpen}>
          <DrawerContent className="z-[60]">
            <DrawerHeader>
              <DrawerTitle>Photo info</DrawerTitle>
            </DrawerHeader>
            <Separator />
            <ScrollArea className="max-h-[70vh]">
              <div className="px-4">
                {!current ? (
                  <div className="py-6 text-xs text-muted-foreground">No photo selected.</div>
                ) : (
                  <>
                    <MetaRow
                      label="Uploaded"
                      value={new Date(current.uploadedAt).toLocaleString()}
                    />
                    <Separator />
                    <MetaRow label="Dimensions" value={`${current.width} x ${current.height}`} />
                    <Separator />
                    <MetaRow label="File size" value={formatBytes(current.fileSize)} />
                    <Separator />
                    <MetaRow label="Faces" value={String(current.faceCount ?? 0)} />
                    <Separator />
                    <div className="py-3 text-xs text-muted-foreground">
                      EXIF metadata UI is not wired yet (backend extracts and stores it, but the
                      photos list API does not currently return it).
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </DrawerContent>
        </Drawer>
      </SheetContent>
    </Sheet>
  );
}
