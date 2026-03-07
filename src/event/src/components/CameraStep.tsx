import { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, ImagePlus, ChevronLeft } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Spinner } from '@/shared/components/ui/spinner';
import { toast } from 'sonner';
import { th } from '../lib/i18n';
import { useFaceDetection } from '../hooks/use-face-detection';

interface CameraStepProps {
  onCapture: (file: File) => void;
  onBack: () => void;
}

export function CameraStep({ onCapture, onBack }: CameraStepProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const { faceDetected, ready: detectorReady, capture } = useFaceDetection({
    videoRef,
    enabled: cameraReady,
  });

  // Start camera
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch {
        if (!cancelled) setCameraError(true);
      }
    })();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const handleCapture = useCallback(async () => {
    const file = await capture();
    if (file) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      onCapture(file);
    }
  }, [capture, onCapture]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 10 * 1024 * 1024) {
        toast.error(th.errors.fileSize.title, {
          description: th.errors.fileSize.description,
        });
        return;
      }

      if (!file.type.startsWith('image/')) {
        toast.error(th.errors.fileType.title, {
          description: th.errors.fileType.description,
        });
        return;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      onCapture(file);
    },
    [onCapture],
  );

  // Camera permission denied — fallback to file picker
  if (cameraError) {
    return (
      <div className="relative flex-1 bg-background">
        <div className="absolute left-4 top-4 z-10">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ChevronLeft className="mr-1 size-4" />
            {th.common.back}
          </Button>
        </div>

        <div className="flex h-full flex-col items-center justify-center px-6 py-20">
          <div className="w-full max-w-sm space-y-6">
            <h1 className="text-center text-xl font-semibold">{th.upload.title}</h1>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/30 p-8 transition-colors hover:border-primary hover:bg-primary/5"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Camera className="size-8 text-primary" />
              </div>
              <p className="text-sm font-medium">{th.upload.tap}</p>
              <p className="mt-1 text-xs text-muted-foreground">{th.upload.orGallery}</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4">
      {/* Top bar */}
      <div className="flex shrink-0 items-center pb-4">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ChevronLeft className="mr-1 size-4" />
          {th.common.back}
        </Button>
      </div>

      {/* Camera viewfinder — fills remaining space */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-muted">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />

        {/* Face guide overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {/* Dim area outside circle */}
          <div
            className="absolute inset-0 bg-background/50"
            style={{
              maskImage: 'radial-gradient(circle 38vw at center, transparent 100%, black 100%)',
              WebkitMaskImage: 'radial-gradient(circle 38vw at center, transparent 100%, black 100%)',
            }}
          />

          {/* Guide circle */}
          <div
            className={`aspect-square w-[76vw] max-w-[320px] rounded-full border-[3px] transition-all duration-300 ${
              faceDetected
                ? 'border-green-400 shadow-[0_0_24px_rgba(74,222,128,0.25)]'
                : 'border-muted-foreground/40'
            }`}
          />
        </div>

        {/* Loading state */}
        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <Spinner className="size-8 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex shrink-0 items-center justify-center gap-8 pt-4">
        {/* Gallery */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-11 w-11 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:bg-accent"
        >
          <ImagePlus className="size-5" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />
        </button>

        {/* Capture */}
        <button
          type="button"
          onClick={handleCapture}
          disabled={!cameraReady || !detectorReady}
          className={`flex h-[68px] w-[68px] items-center justify-center rounded-full border-[3px] transition-all ${
            faceDetected
              ? 'border-green-400 hover:scale-105'
              : 'border-muted-foreground/50'
          }`}
        >
          <div
            className={`h-[54px] w-[54px] rounded-full transition-colors ${
              faceDetected ? 'bg-green-400' : 'bg-primary'
            }`}
          />
        </button>

        {/* Spacer */}
        <div className="h-11 w-11" />
      </div>
    </div>
  );
}
