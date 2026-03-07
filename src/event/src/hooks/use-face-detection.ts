import { useEffect, useRef, useState, useCallback } from 'react';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseFaceDetectionOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
}

export function useFaceDetection({ videoRef, enabled }: UseFaceDetectionOptions) {
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceBox, setFaceBox] = useState<FaceBox | null>(null);
  const [ready, setReady] = useState(false);
  const detectorRef = useRef<FaceDetector | null>(null);
  const rafRef = useRef<number>(0);

  // Initialize MediaPipe face detector
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
      );

      if (cancelled) return;

      const detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.7,
      });

      if (cancelled) {
        detector.close();
        return;
      }

      detectorRef.current = detector;
      setReady(true);
    })().catch((e) => {
      console.warn('[FaceDetection] Failed to initialize:', e);
      // Still mark as ready so camera works without detection
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
      if (detectorRef.current) {
        detectorRef.current.close();
        detectorRef.current = null;
      }
    };
  }, [enabled]);

  // Run detection loop on video frames
  useEffect(() => {
    if (!ready || !enabled) return;

    const video = videoRef.current;
    if (!video) return;

    let lastTimestamp = -1;

    const detect = () => {
      if (!detectorRef.current || !video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }

      const now = performance.now();
      // MediaPipe requires strictly increasing timestamps
      if (now <= lastTimestamp) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }
      lastTimestamp = now;

      try {
        const results = detectorRef.current.detectForVideo(video, now);
        if (results.detections.length > 0) {
          const detection = results.detections[0];
          const bbox = detection.boundingBox;
          if (bbox) {
            setFaceBox({
              x: bbox.originX / video.videoWidth,
              y: bbox.originY / video.videoHeight,
              width: bbox.width / video.videoWidth,
              height: bbox.height / video.videoHeight,
            });
          }
          setFaceDetected(true);
        } else {
          setFaceDetected(false);
          setFaceBox(null);
        }
      } catch {
        // Detection can fail on some frames, ignore
      }

      rafRef.current = requestAnimationFrame(detect);
    };

    rafRef.current = requestAnimationFrame(detect);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [ready, enabled, videoRef]);

  const capture = useCallback(async (): Promise<File | null> => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Mirror the capture to match the mirrored video preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    return new Promise<File | null>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          resolve(new File([blob], 'selfie.jpg', { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.92,
      );
    });
  }, [videoRef]);

  return { faceDetected, faceBox, ready, capture };
}
