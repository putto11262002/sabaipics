import { useState } from 'react';
import { Camera, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { AspectRatio } from '@/shared/components/ui/aspect-ratio';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from '@/shared/components/ui/carousel';
import { th } from '../lib/i18n';
import type { SessionSelfie } from '../lib/api';
import { useDeleteSelfie } from '@/shared/hooks/rq/selfies/use-delete-selfie';

interface HomeStepProps {
  selfies: SessionSelfie[];
  onSearch: (selfieId: string) => void;
  onNewSelfie: () => void;
}

export function HomeStep({ selfies, onSearch, onNewSelfie }: HomeStepProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    selfies.length > 0 ? selfies[0].id : null,
  );
  const { mutate: deleteSelfie, isPending: isDeleting } = useDeleteSelfie();

  const selectedSelfie = selfies.find((s) => s.id === selectedId) ?? null;

  const handleDelete = (selfieId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSelfie(selfieId, {
      onSuccess: () => {
        // If we deleted the selected one, select the next available
        if (selfieId === selectedId) {
          const remaining = selfies.filter((s) => s.id !== selfieId);
          setSelectedId(remaining.length > 0 ? remaining[0].id : null);
        }
        toast.success(th.home.selfieDeleted);
      },
      onError: () => {
        toast.error(th.home.selfieDeleteError);
      },
    });
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center text-xl font-semibold">{th.home.title}</h1>

        {selectedSelfie ? (
          <>
            {/* Main selfie preview */}
            <div className="overflow-hidden rounded-xl border bg-muted">
              <AspectRatio ratio={1}>
                <img
                  src={selectedSelfie.thumbnailUrl}
                  alt="Selfie"
                  className="h-full w-full object-cover"
                />
              </AspectRatio>
            </div>

            {/* Selfie selector carousel */}
            <Carousel opts={{ align: 'start', dragFree: true }} className="overflow-visible pt-2 [&_[data-slot=carousel-content]]:overflow-visible">
              <CarouselContent className="-ml-2">
                {/* Add new selfie — always first */}
                <CarouselItem className="basis-auto pl-2">
                  <button
                    type="button"
                    onClick={onNewSelfie}
                    className="flex size-14 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <Plus className="size-5" />
                  </button>
                </CarouselItem>
                {selfies.map((s) => (
                  <CarouselItem key={s.id} className="basis-auto pl-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setSelectedId(s.id)}
                        disabled={isDeleting}
                        className={`block size-14 overflow-hidden rounded-lg border-2 transition-all ${
                          s.id === selectedId
                            ? 'border-primary ring-2 ring-primary/20'
                            : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={s.thumbnailUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(s.id, e)}
                        disabled={isDeleting}
                        className="absolute -right-1.5 -top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-destructive/10 text-destructive backdrop-blur-md"
                      >
                        <X className="size-3" strokeWidth={3} />
                      </button>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>

            <Button size="lg" className="w-full" onClick={() => onSearch(selectedId!)}>
              <Search className="mr-1 size-4" />
              {th.home.searchWithSelfie}
            </Button>
          </>
        ) : (
          <>
            {/* No selfie yet */}
            <div className="flex flex-col items-center space-y-4 py-8">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                <Camera className="size-10 text-primary" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {th.home.takeSelfie}
              </p>
            </div>

            <Button size="lg" className="w-full" onClick={onNewSelfie}>
              <Camera className="mr-1 size-4" />
              {th.consent.button}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
