'use client';

import { AlertCircle, CheckCircle2, ExternalLink, Hourglass, LoaderCircle, Upload } from 'lucide-react';
import Image from 'next/image';
import { useLocale } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';

import { UploadCameraStage } from './upload-camera-stage';


type UploadMethod = {
  title: string;
  description: string;
  kind: 'ios' | 'web' | 'desktop';
};

const uploadMethods: UploadMethod[] = [
  {
    title: 'iOS app',
    description:
      'Connect to your camera wirelessly, shoot as usual, and keep uploads syncing in the background.',
    kind: 'ios',
  },
  {
    title: 'Web upload',
    description: 'Drag, drop, and batch upload from any modern browser.',
    kind: 'web',
  },
  {
    title: 'Desktop uploader',
    description: 'Stable large-batch transfer from your workstation.',
    kind: 'desktop',
  },
];

const CONNECTOR_BAND_HEIGHT = 110;
const CONNECTOR_START_Y = 0;
const CONNECTOR_END_Y = CONNECTOR_BAND_HEIGHT;

type ConnectorLayout = {
  width: number;
  endpoints: [number, number, number];
  cameraEdges: { left: number; right: number };
};

const defaultConnectorLayout: ConnectorLayout = {
  width: 1200,
  endpoints: [200, 600, 1000],
  cameraEdges: { left: 580, right: 620 },
};

function UploadMethodVisual({ kind }: Pick<UploadMethod, 'kind'>) {
  if (kind === 'ios') {
    const rows = [
      { name: 'IMG_2834.JPG', meta: '540 KB · just now', state: 'downloading' as const },
      { name: 'IMG_2833.JPG', meta: '527 KB · just now', state: 'awaiting' as const },
      { name: 'IMG_2832.JPG', meta: '519 KB · 4s ago', state: 'synced' as const },
      { name: 'IMG_2831.JPG', meta: '512 KB · 9s ago', state: 'synced' as const },
      { name: 'IMG_2830.JPG', meta: '506 KB · 15s ago', state: 'synced' as const },
    ];
    const popStatuses = [
      { text: 'Downloading from camera', state: 'downloading' as const },
      { text: 'Uploading in background', state: 'uploading' as const },
      { text: 'Awaiting server processing', state: 'awaiting' as const },
      { text: 'Retrying failed upload', state: 'failed' as const },
      { text: 'Synced to server', state: 'synced' as const },
    ];

    return (
      <div className="relative h-full overflow-hidden rounded-xl border border-border/80 bg-[linear-gradient(180deg,white_20%,color-mix(in_oklab,var(--primary-end)_14%,white)_58%,color-mix(in_oklab,var(--primary)_22%,white)_100%)] px-3 pt-3">
        <div className="absolute inset-x-0 bottom-0 h-[60%] bg-[radial-gradient(120%_95%_at_50%_100%,color-mix(in_oklab,var(--primary)_28%,white),transparent_72%)]" />

        <div className="pointer-events-none absolute bottom-[18px] right-[36px] z-20 flex flex-col-reverse items-end gap-1.5">
          {popStatuses.map((item, index) => (
            <div
              key={`pop-${item.text}-${index}`}
              className={[
                'inline-flex w-[136px] items-center gap-1.5 rounded-full border border-[color:color-mix(in_oklab,var(--primary)_36%,var(--border))] bg-card px-2 py-1 text-[8px] font-medium text-foreground shadow-[0_12px_20px_-12px_color-mix(in_oklab,var(--foreground)_55%,transparent)]',
                index === 0 ? 'opacity-92' : '',
                index === 1 ? 'opacity-95' : '',
                index === 2 ? 'opacity-100' : '',
              ].join(' ')}
            >
              {item.state === 'downloading' ? (
                <LoaderCircle className="h-3 w-3 text-muted-foreground" />
              ) : item.state === 'uploading' ? (
                <Upload className="h-3 w-3 text-primary" />
              ) : item.state === 'awaiting' ? (
                <Hourglass className="h-3 w-3 text-warning" />
              ) : item.state === 'failed' ? (
                <AlertCircle className="h-3 w-3 text-destructive" />
              ) : (
                <CheckCircle2 className="h-3 w-3 text-success" />
              )}
              <span className="truncate">{item.text}</span>
            </div>
          ))}
        </div>

        <div className="pointer-events-none absolute bottom-[-56px] left-[46%] z-10 h-[252px] w-[144px] -translate-x-1/2 rounded-[24px] border border-border/80 bg-[#f8f9fc] p-2 shadow-[0_22px_42px_-22px_color-mix(in_oklab,var(--foreground)_40%,transparent)]">
          <div className="mx-auto h-1 w-10 rounded-full bg-zinc-300/80" />

          <div className="mt-1.5 rounded-md border border-border/70 bg-white">
            <div className="flex items-center justify-between border-b border-border/70 px-2 py-1.5 text-[7px]">
              <p className="text-muted-foreground">Event</p>
              <p className="max-w-[66px] truncate font-medium text-foreground">FF REVIEW EVENT</p>
            </div>
            <div className="flex items-center justify-between border-b border-border/70 px-2 py-1.5 text-[7px]">
              <p className="text-muted-foreground">Camera</p>
              <p className="font-medium text-foreground">EOS80D</p>
            </div>
            <div className="flex items-center justify-between border-b border-border/70 px-2 py-1.5 text-[7px]">
              <p className="text-muted-foreground">Downloaded</p>
              <p className="font-medium text-foreground">248</p>
            </div>
            <div className="flex items-center justify-between px-2 py-1.5 text-[7px]">
              <p className="text-muted-foreground">Synced</p>
              <p className="font-medium text-foreground">232</p>
            </div>
          </div>

          <div className="mt-2 space-y-1.5">
            {rows.map((row) => (
              <div key={row.name} className="flex items-center gap-1.5 border-b border-border/70 pb-1.5">
                <span className="h-6 w-6 rounded-[6px] border border-border/70 bg-[linear-gradient(160deg,#ffe8c8,#ffd6b3)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[7px] font-semibold text-foreground">{row.name}</p>
                  <p className="text-[6px] text-muted-foreground">{row.meta}</p>
                </div>
                {row.state === 'downloading' ? (
                  <LoaderCircle className="h-3 w-3 text-muted-foreground" />
                ) : row.state === 'awaiting' ? (
                  <Hourglass className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 text-[color:color-mix(in_oklab,var(--primary)_80%,black)]" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'web') {
    return (
      <div className="relative h-full overflow-hidden rounded-xl border border-border/80 bg-[linear-gradient(180deg,white_20%,color-mix(in_oklab,var(--primary-end)_14%,white)_58%,color-mix(in_oklab,var(--primary)_22%,white)_100%)] px-3 py-3">
        <div className="absolute inset-x-0 bottom-0 h-[60%] bg-[radial-gradient(120%_95%_at_50%_100%,color-mix(in_oklab,var(--primary)_28%,white),transparent_72%)]" />
        <div className="relative z-10 mt-10 rounded-lg border border-border/80 bg-card/85">
          <div className="flex items-center gap-1.5 border-b border-border/80 px-2 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-border" />
            <span className="h-1.5 w-1.5 rounded-full bg-border" />
            <span className="h-1.5 w-1.5 rounded-full bg-border" />
            <span className="ml-1 flex-1 truncate rounded-full bg-muted/65 px-2 py-0.5 text-[7px] text-muted-foreground">
              app.framefast.io/events/ff-review/upload
            </span>
          </div>

          <div className="space-y-1.5 p-2">
            <div className="rounded-md border border-dashed border-border/80 bg-muted/28 px-2 py-1.5">
              <p className="text-[8px] font-medium text-foreground">Drag photos here or click to browse</p>
              <p className="mt-0.5 text-[7px] text-muted-foreground">JPEG, PNG, WebP · max 10MB each</p>
            </div>

            <div className="rounded-md border border-border/80 bg-muted/25 px-2 py-1">
              <div className="flex items-center gap-2">
                <LoaderCircle className="h-3 w-3 animate-spin text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[8px] font-medium text-foreground">Uploading 12 photos...</p>
                  <div className="mt-1 h-1 w-full rounded-full bg-border/70">
                    <div className="h-1 w-[58%] rounded-full bg-primary" />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border/80 bg-background">
              <div className="flex items-center justify-between border-b border-border/80 px-2 py-1">
                <p className="text-[8px] font-medium text-muted-foreground">Recent uploads</p>
                <p className="text-[7px] text-muted-foreground">Page 1</p>
              </div>
              {[
                { name: 'IMG_3021.JPG', status: 'indexing', size: '5.1MB', source: 'web' },
                { name: 'IMG_3019.JPG', status: 'done', size: '4.8MB', source: 'ios' },
                { name: 'IMG_3012.JPG', status: 'failed', size: '6.2MB', source: 'ftp' },
              ].map((row) => (
                <div key={row.name} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-1.5 border-b border-border/70 px-2 py-1 last:border-b-0">
                  <p className="truncate text-[7px] font-medium text-foreground">{row.name}</p>
                  <span className="rounded-full border border-border/80 px-1 py-0 text-[6px] uppercase tracking-[0.08em] text-muted-foreground">
                    {row.source}
                  </span>
                  <span className="text-[7px] text-muted-foreground">{row.size}</span>
                  {row.status === 'done' ? (
                    <CheckCircle2 className="h-2.5 w-2.5 text-success" />
                  ) : row.status === 'failed' ? (
                    <AlertCircle className="h-2.5 w-2.5 text-destructive" />
                  ) : (
                    <LoaderCircle className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    );
  }

  const desktopQueueEntries = [
    { directory: 'Weddings/BKK/Camera-A', event: 'FF REVIEW EVENT', target: 72 },
    { directory: 'Corporate/Gala/Set-1', event: 'CORP GALA', target: 43 },
    { directory: 'Graduation/Day-2', event: 'GRAD 2026', target: 91 },
    { directory: 'Selects/Final-Export', event: 'FF REVIEW EVENT', target: 28 },
    { directory: 'Agency/Brand-Shoot', event: 'BRAND LAUNCH', target: 64 },
    { directory: 'Afterparty/Night-Set', event: 'FF REVIEW EVENT', target: 52 },
    { directory: 'Wedding/ChiangMai/Set-A', event: 'CM WEDDING', target: 39 },
    { directory: 'Wedding/ChiangMai/Set-B', event: 'CM WEDDING', target: 58 },
    { directory: 'Conference/Main-Hall', event: 'TECH CONF', target: 47 },
    { directory: 'Portrait/Studio-Day', event: 'PORTFOLIO', target: 84 },
  ];
  const [desktopProgress, setDesktopProgress] = useState<number[]>(
    desktopQueueEntries.map(() => 0),
  );

  useEffect(() => {
    if (kind !== 'desktop') return;

    const interval = window.setInterval(() => {
      setDesktopProgress((previous) =>
        previous.map((value, index) => {
          const goal = desktopQueueEntries[index].target;
          if (value >= goal) return value;
          return Math.min(goal, value + (index % 3) + 1);
        }),
      );
    }, 140);

    return () => window.clearInterval(interval);
  }, [kind]);

  const floatingScene = desktopQueueEntries.slice(0, 4).map((entry, index) => {
    const progress = desktopProgress[index];
    const depthScales = ['scale-100', 'scale-[0.992]', 'scale-[0.985]', 'scale-[0.978]'];

    return (
      <div
        key={entry.directory}
        className={[
          'w-full origin-left rounded-lg border border-white/70 bg-background/84 p-2 shadow-[0_14px_28px_-16px_color-mix(in_oklab,var(--foreground)_55%,transparent)] backdrop-blur-md',
          depthScales[index],
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[7px] font-semibold text-foreground">{entry.directory}</p>
            <p className="truncate text-[6px] text-muted-foreground">{entry.event}</p>
          </div>
          <span className="text-[7px] font-semibold tabular-nums text-foreground">{progress}%</span>
        </div>
        <div className="mt-1 h-1 w-full rounded-full bg-border/70">
          <div className="h-1 rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>
    );
  });

  /*
   * Legacy desktop scene backup (keep, do not delete):
   * - Visual wrapper: relative + rounded-xl + gradient background.
   * - Overlay layout: absolute grid with 2 columns.
   * - Left column: centered iOS app icon.
   * - Right column: floating stacked sync entries (`floatingScene`).
   * Current tuning:
   * - grid offset: `-translate-x-3`
   * - right stack offset: `-ml-4`
   * - right stack top align: `items-start pt-10`
   *
   * This is intentionally documented before we try the absolute-anchor rewrite.
   */
  return (
    <div className="relative h-full overflow-hidden rounded-xl border border-border/80 bg-[linear-gradient(180deg,white_20%,color-mix(in_oklab,var(--primary-end)_14%,white)_58%,color-mix(in_oklab,var(--primary)_22%,white)_100%)] px-3 py-3">
      <div className="absolute inset-x-0 bottom-0 h-[60%] bg-[radial-gradient(120%_95%_at_50%_100%,color-mix(in_oklab,var(--primary)_28%,white),transparent_72%)]" />

      <div className="absolute inset-0 z-[12] grid -translate-x-3 grid-cols-2 items-stretch">
        <div className="flex h-full items-center justify-center">
          <Image
            src="/landing/ios-app-icon.png"
            alt="FrameFast app icon"
            width={64}
            height={64}
            className="h-16 w-16 rounded-2xl shadow-[0_16px_26px_-14px_color-mix(in_oklab,var(--foreground)_35%,transparent)]"
          />
        </div>

        <div className="relative flex h-full items-start pt-10">
          <div className="-ml-4 flex w-[196px] flex-col gap-2">
            {floatingScene}
          </div>
        </div>
      </div>
    </div>
  );
}

function UploadMethodCard({ title, description, kind }: UploadMethod) {
  const locale = useLocale();
  const compatibilityHref = `/${locale}/compatibility`;

  return (
    <article className="grid h-full grid-rows-[248px_1fr] overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[0_20px_40px_-36px_color-mix(in_oklab,var(--foreground)_36%,transparent)]">
      <UploadMethodVisual kind={kind} />

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 min-h-[3.5rem] text-sm leading-5 text-muted-foreground">{description}</p>
        {kind === 'ios' && (
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
            <a
              href="#ios-app"
              className="inline-flex w-fit items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/55"
            >
              See iOS app
            </a>
            <a
              href={compatibilityHref}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Compatible cameras
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
        {kind === 'web' && (
          <div className="mt-auto pt-3">
            <a
              href="#pricing"
              className="inline-flex w-fit items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/55"
            >
              Start free trial
            </a>
          </div>
        )}
        {kind === 'desktop' && (
          <div className="mt-auto pt-3">
            <a
              href="#desktop-app"
              className="inline-flex w-fit items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/55"
            >
              Download
            </a>
          </div>
        )}
      </div>
    </article>
  );
}

function UploadMethodCardMobile({ title, description, kind }: UploadMethod) {
  const locale = useLocale();
  const compatibilityHref = `/${locale}/compatibility`;

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[0_20px_40px_-36px_color-mix(in_oklab,var(--foreground)_36%,transparent)]">
      <div className="h-[220px]">
        <UploadMethodVisual kind={kind} />
      </div>
      <div className="mt-3">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 text-sm leading-5 text-muted-foreground">{description}</p>
        {kind === 'ios' && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href="#ios-app"
              className="inline-flex w-fit items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/55"
            >
              See iOS app
            </a>
            <a
              href={compatibilityHref}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Compatible cameras
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
        {kind === 'web' && (
          <a
            href="#pricing"
            className="mt-3 inline-flex w-fit items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/55"
          >
            Start free trial
          </a>
        )}
        {kind === 'desktop' && (
          <a
            href="#desktop-app"
            className="mt-3 inline-flex w-fit items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/55"
          >
            Download
          </a>
        )}
      </div>
    </article>
  );
}

type FlowTokenProps = {
  pathId: string;
  begin: string;
  dur: string;
};

function FlowToken({ pathId, begin, dur }: FlowTokenProps) {
  return (
    <g opacity="0.95">
      <image
        href="/image.svg"
        x="-15"
        y="-12"
        width="30"
        height="24"
        preserveAspectRatio="xMidYMid meet"
      />
      <animateMotion begin={begin} dur={dur} repeatCount="indefinite" rotate="0">
        <mpath href={`#${pathId}`} />
      </animateMotion>
    </g>
  );
}

function DesktopConnectors({
  width,
  endpoints,
  cameraEdges,
  prefersReducedMotion,
}: ConnectorLayout & { prefersReducedMotion: boolean }) {
  const uid = useId().replace(/:/g, '');
  const [, middleX] = endpoints;
  const { left: cameraLeft, right: cameraRight } = cameraEdges;

  // Middle path: from center bottom of camera, straight down
  const cameraCenterX = (cameraLeft + cameraRight) / 2;
  const middlePath = `M ${cameraCenterX} 0 L ${middleX} ${CONNECTOR_END_Y}`;
  const middleId = `${uid}-middle`;

  return (
    <svg
      className="pointer-events-none absolute inset-x-0 top-0 w-full overflow-visible"
      style={{ height: CONNECTOR_BAND_HEIGHT, overflow: 'visible' }}
      viewBox={`0 0 ${Math.max(1, width)} ${CONNECTOR_BAND_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <path id={middleId} d={middlePath} />
      </defs>

      <use href={`#${middleId}`} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.4" strokeLinecap="round" opacity="0.3" />

      {!prefersReducedMotion && (
        <FlowToken pathId={middleId} begin="-1.4s" dur="4.0s" />
      )}
    </svg>
  );
}

export function UploadWaySection() {
  const showcaseRef = useRef<HTMLDivElement>(null);
  const connectorAreaRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [connectorLayout, setConnectorLayout] = useState<ConnectorLayout>(defaultConnectorLayout);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [showcaseVisible, setShowcaseVisible] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);

    return () => {
      mediaQuery.removeEventListener('change', updatePreference);
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setShowcaseVisible(true);
      return;
    }

    const element = showcaseRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const isInView = entries.some((entry) => entry.isIntersecting);
        if (!isInView) return;
        setShowcaseVisible(true);
        observer.disconnect();
      },
      { threshold: 0.18, rootMargin: '0px 0px -10% 0px' },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    const updateLayout = () => {
      const connectorArea = connectorAreaRef.current;
      const camera = cameraRef.current;
      if (!connectorArea) return;

      const areaRect = connectorArea.getBoundingClientRect();

      // Measure camera edges relative to connector area
      let cameraEdges = { left: areaRect.width / 2 - 60, right: areaRect.width / 2 + 60 };
      if (camera) {
        const cameraRect = camera.getBoundingClientRect();
        cameraEdges = {
          left: cameraRect.left - areaRect.left,
          right: cameraRect.right - areaRect.left,
        };
      }

      const points = cardRefs.current
        .slice(0, 3)
        .map((card) => {
          if (!card) return null;
          const cardRect = card.getBoundingClientRect();
          return cardRect.left + cardRect.width / 2 - areaRect.left;
        })
        .filter((value): value is number => value !== null);

      if (points.length !== 3) return;

      const nextLayout: ConnectorLayout = {
        width: Math.max(areaRect.width, 1),
        endpoints: [points[0], points[1], points[2]],
        cameraEdges,
      };

      setConnectorLayout((prevLayout) => {
        const widthStable = Math.abs(prevLayout.width - nextLayout.width) < 0.5;
        const endpointsStable = prevLayout.endpoints.every(
          (value, index) => Math.abs(value - nextLayout.endpoints[index]) < 0.5,
        );
        const cameraStable =
          Math.abs(prevLayout.cameraEdges.left - nextLayout.cameraEdges.left) < 0.5 &&
          Math.abs(prevLayout.cameraEdges.right - nextLayout.cameraEdges.right) < 0.5;
        return widthStable && endpointsStable && cameraStable ? prevLayout : nextLayout;
      });
    };

    const observer = new ResizeObserver(updateLayout);

    if (connectorAreaRef.current) {
      observer.observe(connectorAreaRef.current);
    }

    if (cameraRef.current) {
      observer.observe(cameraRef.current);
    }

    cardRefs.current.forEach((card) => {
      if (card) observer.observe(card);
    });

    updateLayout();
    window.addEventListener('resize', updateLayout, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateLayout);
    };
  }, []);

  return (
    <section id="upload" className="scroll-mt-24 bg-muted/30 pb-16 pt-6 sm:pb-20 sm:pt-8">
      <div className="mx-auto max-w-7xl px-4">
        <div className="max-w-xl">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Upload your way</h2>
        <p className="mt-2 text-muted-foreground">
          Pick the ingest path that fits the job, all feeding one delivery workflow.
        </p>
        </div>

        <div
          ref={showcaseRef}
          className={[
            'mt-8',
            prefersReducedMotion ? '' : 'transition-all duration-500 ease-out',
            prefersReducedMotion || showcaseVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
          ].join(' ')}
        >
          <div className="hidden md:block">
            {/* <div ref={cameraRef} className="mx-auto w-full max-w-[160px] lg:max-w-[200px]">
              <UploadCameraStage />
            </div>

            <div ref={connectorAreaRef} className="-mt-2 overflow-visible">
              <div className="relative overflow-visible">
                <DesktopConnectors {...connectorLayout} prefersReducedMotion={prefersReducedMotion} />
                <div className="grid grid-cols-3 gap-6 lg:gap-8" style={{ paddingTop: CONNECTOR_BAND_HEIGHT }}> */}
            <div ref={connectorAreaRef}>
              <div className="grid grid-cols-3 gap-6 lg:gap-8">
                  {uploadMethods.map((method, index) => (
                    <div
                      key={method.title}
                      ref={(element) => {
                        cardRefs.current[index] = element;
                      }}
                    >
                    <UploadMethodCard {...method} />
                  </div>
                ))}
              </div>
            </div>
            {/* </div>
            </div> */}
          </div>

          <div className="grid gap-3 md:hidden">
            {uploadMethods.map((method) => (
              <UploadMethodCardMobile key={method.title} {...method} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
