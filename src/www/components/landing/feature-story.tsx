'use client';

import { motion, useInView } from 'framer-motion';
import {
  ArrowRight,
  Calendar,
  Check,
  CreditCard,
  Image as ImageIcon,
  LayoutDashboard,
  MoreHorizontal,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Smile,
  User,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { LogoMark } from '@/shared/components/icons/logo-mark';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';

type Step = {
  id: string;
  label: string;
  title: string;
  description: string;
  ctaLabel: string;
  pageGradient: string;
  gradientBase: string;
  gradientRadial: string;
  Variant: () => ReactElement;
};

const STACKED_PRIMARY_END_GRADIENT =
  'linear-gradient(90deg, color-mix(in oklab, var(--primary) 6%, transparent) 0%, color-mix(in oklab, var(--primary-end) 10%, transparent) 52%, color-mix(in oklab, var(--primary) 5%, transparent) 100%), radial-gradient(138% 88% at 50% 104%, color-mix(in oklab, var(--primary-end) 44%, transparent) 0%, color-mix(in oklab, var(--primary-end) 22%, transparent) 42%, transparent 78%), radial-gradient(96% 72% at 18% 102%, color-mix(in oklab, var(--primary) 20%, transparent) 0%, transparent 84%), radial-gradient(96% 72% at 82% 102%, color-mix(in oklab, var(--primary-end) 24%, transparent) 0%, transparent 84%)';

function VisualShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-full overflow-hidden rounded-xl border border-border bg-card">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(96% 74% at 50% 112%, color-mix(in oklab, var(--primary-end) 10%, transparent) 0%, transparent 76%)',
        }}
        aria-hidden="true"
      />
      <div className="relative h-full px-[4.8%] py-4 sm:py-5">{children}</div>
    </div>
  );
}

const FACE_MATCH_RESULTS = [98, 96, 95, 94, 97, 93, 92, 95, 91, 94, 96, 93, 90, 90];
const LINE_REPLY_RESULTS = FACE_MATCH_RESULTS.slice(0, 10);

function FaceVariant() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, margin: '-100px' });
  const [hasStarted, setHasStarted] = useState(false);
  const [phase, setPhase] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);
  const [cycleKey, setCycleKey] = useState(0);

  // Start animation when first entering view
  useEffect(() => {
    if (isInView && !hasStarted) {
      setHasStarted(true);
    }
  }, [isInView, hasStarted]);

  // Run animation cycle when started
  useEffect(() => {
    if (!hasStarted) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const schedule = (callback: () => void, delay: number) => {
      const id = setTimeout(() => {
        if (!cancelled) callback();
      }, delay);
      timers.push(id);
    };

    const runCycle = () => {
      setCycleKey((prev) => prev + 1);
      setPhase(1);
      setRevealedCount(0);

      const analyseAt = 980;
      const searchAt = 1880;
      const revealStartAt = 2480;

      schedule(() => setPhase(2), analyseAt);
      schedule(() => setPhase(3), searchAt);

      FACE_MATCH_RESULTS.forEach((_, index) => {
        schedule(() => setRevealedCount(index + 1), revealStartAt + index * 150);
      });

      const revealDoneAt = revealStartAt + FACE_MATCH_RESULTS.length * 150;
      schedule(() => setPhase(4), revealDoneAt + 740);
      schedule(runCycle, 6200);
    };

    runCycle();

    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [hasStarted]);

  const streamedPercent = Math.min(
    100,
    Math.round((revealedCount / FACE_MATCH_RESULTS.length) * 100),
  );
  const steps = [
    {
      title: 'Upload',
      activeText: 'Uploading selfie...',
      doneText: 'Upload done',
    },
    {
      title: 'Analyse image',
      activeText: 'Analysing image...',
      doneText: 'Analysis done',
    },
    {
      title: 'Searching result',
      activeText: `Searching result... ${streamedPercent}%`,
      doneText: 'Result ready',
    },
  ];

  return (
    <div ref={ref} className="relative h-full overflow-visible px-[4.8%] pt-[5.2%]">
      <div className="relative flex h-full flex-col justify-start pt-1">
        <motion.div
          key={`terminal-${cycleKey}`}
          className="w-full space-y-2"
        >
          {steps.map((step, index) => {
            const stepNumber = index + 1;
            const isVisible = phase >= stepNumber;
            if (!isVisible) return null;

            const isDone = phase > stepNumber;
            const isActive = phase === stepNumber;
            const statusText = isDone ? step.doneText : step.activeText;
            const dotClass = isDone
              ? 'bg-primary text-primary-foreground'
              : isActive
                ? 'bg-primary/20 text-primary'
                : 'bg-foreground/10 text-muted-foreground';

            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 8, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-2.5 py-2 shadow-[0_14px_28px_-24px_color-mix(in_oklab,var(--foreground)_34%,transparent)] sm:px-3 sm:py-2.5"
              >
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${dotClass}`}
                >
                  {isDone ? '✓' : stepNumber}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-foreground sm:text-[13px]">
                    {step.title}
                  </span>
                  <span className="block text-[11px] text-muted-foreground sm:text-xs">
                    {statusText}
                  </span>
                </span>
                {isActive && (
                  <motion.span
                    className="inline-block h-2.5 w-2.5 rounded-full bg-primary/75"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                )}
              </motion.div>
            );
          })}
        </motion.div>

        <div className="mt-4 w-full min-h-[208px]">
          <div className="grid grid-cols-3 gap-2">
            {FACE_MATCH_RESULTS.map((confidence, index) => {
              const isVisible = index < revealedCount;
              if (!isVisible) return null;
              return (
                <motion.div
                  key={`match-${index}`}
                  className="relative aspect-square overflow-hidden rounded-md border backdrop-blur-lg"
                  style={{
                    borderColor: 'color-mix(in oklab, var(--background) 90%, var(--foreground) 10%)',
                    background: 'color-mix(in oklab, var(--background) 46%, transparent)',
                    boxShadow:
                      '0 12px 28px -24px color-mix(in oklab, var(--foreground) 26%, transparent), inset 0 1px 0 color-mix(in oklab, white 55%, transparent), inset 0 -1px 0 color-mix(in oklab, var(--foreground) 6%, transparent)',
                  }}
                  initial={{ opacity: 0, scale: 0.92, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                >
                  <div
                    className="absolute inset-x-0 top-0 h-1/2 opacity-80"
                    style={{
                      background:
                        'linear-gradient(180deg, color-mix(in oklab, white 52%, transparent) 0%, transparent 100%)',
                    }}
                  />
                  <div className="absolute right-2 top-2 rounded-full border border-border bg-background/80 px-1.5 py-0.5 text-[9px] font-semibold text-foreground/80">
                    ✓ {confidence}%
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function LineVariant() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, margin: '-100px' });
  const [hasStarted, setHasStarted] = useState(false);
  const [phase, setPhase] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);
  const [cycleKey, setCycleKey] = useState(0);

  // Start animation when first entering view
  useEffect(() => {
    if (isInView && !hasStarted) {
      setHasStarted(true);
    }
  }, [isInView, hasStarted]);

  // Run animation cycle when started
  useEffect(() => {
    if (!hasStarted) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const schedule = (callback: () => void, delay: number) => {
      const id = setTimeout(() => {
        if (!cancelled) callback();
      }, delay);
      timers.push(id);
    };

    const runCycle = () => {
      setCycleKey((prev) => prev + 1);
      setPhase(1);
      setRevealedCount(0);

      const replyAt = 1100;
      const revealStartAt = 1520;
      schedule(() => setPhase(2), replyAt);

      LINE_REPLY_RESULTS.forEach((_, index) => {
        schedule(() => setRevealedCount(index + 1), revealStartAt + index * 170);
      });

      const revealDoneAt = revealStartAt + LINE_REPLY_RESULTS.length * 170;
      schedule(() => setPhase(3), revealDoneAt + 380);
      schedule(runCycle, 6200);
    };

    runCycle();

    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [hasStarted]);

  return (
    <div ref={ref} className="relative flex h-full items-start justify-center px-[1.8%] pt-[16%]">
      <div className="relative h-auto w-[clamp(14rem,56vw,17rem)] aspect-[9/19.5] overflow-hidden rounded-[2.3rem] border border-border/70 shadow-[0_30px_54px_-38px_color-mix(in_oklab,var(--foreground)_40%,transparent)] backdrop-blur-xl sm:w-[clamp(15rem,46vw,18rem)] lg:w-[clamp(16.8rem,35.7vw,20rem)]">
        <div
          className="absolute inset-[1.8%] rounded-[2rem] border border-border/70"
          style={{
            boxShadow:
              'inset 0 1px 0 color-mix(in oklab, white 60%, transparent), inset 0 -1px 0 color-mix(in oklab, var(--foreground) 8%, transparent)',
          }}
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute left-1/2 top-[3.2%] h-[3.4%] w-[34%] -translate-x-1/2 rounded-full border border-border/70 bg-background/40 backdrop-blur-sm" />

        <div className="absolute inset-[4.2%] rounded-[1.75rem] px-1 pb-[4.6%] pt-[9.8%]">
          <motion.div
            key={`line-${cycleKey}`}
            className="space-y-6"
            // animate={{ y: [0, -2, 0] }}
            // transition={{ duration: 3.2, ease: 'easeInOut', repeat: Infinity }}
          >
            {phase >= 1 && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="flex items-start justify-end gap-[2.4%]"
              >
                <div className="flex w-full flex-col items-end gap-2">
                  <div className="flex w-[80%] justify-end md:w-[60%] lg:w-[50%]">
                    <div className="w-fit rounded-2xl border border-border bg-background/60 px-3 py-1.5 text-xs text-foreground shadow-[0_10px_22px_-18px_color-mix(in_oklab,var(--foreground)_34%,transparent)] backdrop-blur-md sm:text-xs">
                      My selfie!
                    </div>
                  </div>
                  <div className="flex w-full justify-end">
                    <div
                      className="relative aspect-square w-1/4 overflow-hidden rounded-md border backdrop-blur-lg"
                      style={{
                        borderColor: 'color-mix(in oklab, var(--background) 90%, var(--foreground) 10%)',
                        background: 'color-mix(in oklab, var(--background) 44%, transparent)',
                        boxShadow:
                          '0 12px 28px -24px color-mix(in oklab, var(--foreground) 24%, transparent), inset 0 1px 0 color-mix(in oklab, white 55%, transparent), inset 0 -1px 0 color-mix(in oklab, var(--foreground) 6%, transparent)',
                      }}
                    >
                      <div
                        className="absolute inset-x-0 top-0 h-1/2 opacity-80"
                        style={{
                          background:
                            'linear-gradient(180deg, color-mix(in oklab, white 52%, transparent) 0%, transparent 100%)',
                        }}
                      />
                    </div>
                  </div>
                </div>
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-[0_8px_18px_-14px_color-mix(in_oklab,var(--foreground)_40%,transparent)]">
                  <User className="h-3.5 w-3.5" />
                </span>
              </motion.div>
            )}

            {phase >= 2 && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.26, ease: 'easeOut' }}
                className="flex items-start gap-[2.4%]"
              >
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background/92 text-[10px] font-semibold text-foreground shadow-[0_8px_18px_-14px_color-mix(in_oklab,var(--foreground)_40%,transparent)]">
                  <LogoMark className="h-3.5 w-3.5 text-primary" />
                </span>
                <div className="w-full space-y-[2.6%]">

                  <div className="grid w-[80%] grid-cols-2 gap-1.5 lg:w-[60%]">
                    {LINE_REPLY_RESULTS.map((_, index) => {
                      if (index >= revealedCount) return null;
                      return (
                        <motion.div
                          key={`line-result-${index}`}
                          className="relative aspect-square overflow-hidden rounded-md border backdrop-blur-lg"
                          style={{
                            borderColor: 'color-mix(in oklab, var(--background) 90%, var(--foreground) 10%)',
                            background: 'color-mix(in oklab, var(--background) 44%, transparent)',
                            boxShadow:
                              '0 12px 28px -24px color-mix(in oklab, var(--foreground) 24%, transparent), inset 0 1px 0 color-mix(in oklab, white 55%, transparent), inset 0 -1px 0 color-mix(in oklab, var(--foreground) 6%, transparent)',
                          }}
                          initial={{ opacity: 0, scale: 0.92, y: 6 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                        >
                          <div
                            className="absolute inset-x-0 top-0 h-1/2 opacity-80"
                            style={{
                              background:
                                'linear-gradient(180deg, color-mix(in oklab, white 52%, transparent) 0%, transparent 100%)',
                            }}
                          />
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>

      </div>
    </div>
  );
}

function ColorVariant() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden px-[4.8%] pb-[4.8%] pt-[5.2%]">
      <div className="z-20 flex shrink-0 flex-col gap-2.5">
        <div className="flex flex-row items-center justify-between gap-3 rounded-xl border border-border/65 bg-card px-4 py-3 shadow-[0_18px_38px_-28px_color-mix(in_oklab,var(--foreground)_45%,transparent),inset_0_1px_0_color-mix(in_oklab,white_58%,transparent),inset_0_-1px_0_color-mix(in_oklab,var(--foreground)_10%,transparent)]">
          <span className="text-xs font-medium text-foreground">LUT strength</span>
          <div className="w-[52%] min-w-[8rem]">
            <Slider defaultValue={[72]} max={100} step={1} variant="primary" />
          </div>
        </div>

        <div className="flex flex-row items-center justify-between gap-3 rounded-xl border border-border/65 bg-card px-4 py-3 shadow-[0_18px_38px_-28px_color-mix(in_oklab,var(--foreground)_45%,transparent),inset_0_1px_0_color-mix(in_oklab,white_58%,transparent),inset_0_-1px_0_color-mix(in_oklab,var(--foreground)_10%,transparent)]">
          <span className="text-xs font-medium text-foreground">Warmth bias</span>
          <div className="w-[52%] min-w-[8rem]">
            <Slider defaultValue={[58]} max={100} step={1} variant="primary" />
          </div>
        </div>

        <div className="flex flex-row items-center justify-between gap-3 rounded-xl border border-border/65 bg-card px-4 py-3 shadow-[0_18px_38px_-28px_color-mix(in_oklab,var(--foreground)_45%,transparent),inset_0_1px_0_color-mix(in_oklab,white_58%,transparent),inset_0_-1px_0_color-mix(in_oklab,var(--foreground)_10%,transparent)]">
          <span className="text-xs font-medium text-foreground">Skin tone protect</span>
          <div className="flex w-[52%] min-w-[8rem] items-center justify-end">
            <Switch defaultChecked variant="primary" />
          </div>
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 sm:mt-5">
        <div className="grid h-full grid-cols-3 content-start gap-2 sm:gap-2.5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`grade-tile-${index}`}
              className="relative aspect-square overflow-hidden rounded-md border border-border/75 shadow-[0_10px_24px_-20px_color-mix(in_oklab,var(--foreground)_40%,transparent)]"
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'radial-gradient(86% 78% at 20% 22%, color-mix(in oklab, var(--foreground) 14%, transparent) 0%, transparent 72%), linear-gradient(156deg, color-mix(in oklab, var(--background) 84%, transparent) 0%, color-mix(in oklab, var(--foreground) 7%, transparent) 100%)',
                }}
              />

              <motion.div
                className="absolute inset-y-0 left-0 overflow-hidden"
                animate={{ width: ['0%', '100%', '0%'] }}
                transition={{ duration: 4.2, ease: 'easeInOut', repeat: Infinity }}
              >
                <div
                  className="h-full w-[120%]"
                  style={{
                    background:
                      'radial-gradient(88% 76% at 24% 28%, color-mix(in oklab, var(--primary-end) 38%, transparent) 0%, transparent 70%), radial-gradient(84% 74% at 78% 70%, color-mix(in oklab, var(--primary) 38%, transparent) 0%, transparent 72%), linear-gradient(160deg, color-mix(in oklab, var(--primary-end) 26%, transparent) 0%, color-mix(in oklab, var(--primary) 30%, transparent) 58%, color-mix(in oklab, var(--primary-end) 18%, transparent) 100%)',
                  }}
                />
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DashboardVariant() {
  const events = [
    { name: 'Siam Paragon Wedding Reception', created: 'Feb 15, 2026', expires: 'Mar 17, 2026' },
    { name: 'Bangkok Corporate Summit 2026', created: 'Feb 15, 2026', expires: 'Mar 17, 2026' },
    { name: 'Chula Graduation Portrait Day', created: 'Feb 14, 2026', expires: 'Mar 16, 2026' },
    { name: 'Riverside Charity Gala Night', created: 'Feb 13, 2026', expires: 'Mar 15, 2026' },
    { name: 'Studio Family Mini Sessions', created: 'Feb 12, 2026', expires: 'Mar 14, 2026' },
    { name: 'Beach Proposal Weekend', created: 'Feb 11, 2026', expires: 'Mar 13, 2026' },
    { name: 'International School Prom', created: 'Feb 10, 2026', expires: 'Mar 12, 2026' },
    { name: 'Luxury Brand Launch Party', created: 'Feb 09, 2026', expires: 'Mar 11, 2026' },
    { name: 'Temple Blessing Ceremony', created: 'Feb 08, 2026', expires: 'Mar 10, 2026' },
    { name: 'Hotel Ballroom Engagement', created: 'Feb 07, 2026', expires: 'Mar 09, 2026' },
  ];

  return (
    <div className="relative h-full overflow-hidden">
      <div className="absolute left-[4.8%] top-[7%] h-auto w-[clamp(26rem,128vw,38rem)] aspect-[16/9] origin-top-left overflow-hidden rounded-lg border border-border bg-background shadow-[0_24px_48px_-36px_color-mix(in_oklab,var(--foreground)_38%,transparent)] sm:w-[clamp(30rem,118vw,44rem)] md:w-[clamp(32rem,104vw,48rem)] lg:top-1/2 lg:-translate-y-1/2 lg:w-[clamp(30rem,80vw,46rem)] lg:scale-[0.96] xl:w-[clamp(35rem,84vw,54rem)] xl:scale-100">
        <div className="grid h-full grid-cols-[23%_1fr]">
        <aside className="border-r border-border/80 bg-card/55 p-2.5">
          <div className="flex items-center gap-1.5">
            <LogoMark className="h-[clamp(11px,1.15vw,15px)] w-[clamp(11px,1.15vw,15px)] text-primary" />
            <span className="text-[clamp(10px,1.1vw,12px)] font-semibold text-foreground">FrameFast</span>
          </div>
          <p className="mt-3 text-[clamp(9px,0.95vw,11px)] font-medium text-muted-foreground">Platform</p>
          <div className="mt-1.5 space-y-1">
            <div className="flex items-center gap-1.5 rounded-md bg-muted px-1.5 py-1 text-[clamp(9px,0.95vw,11px)] font-medium text-foreground">
              <LayoutDashboard className="h-[clamp(9px,0.95vw,12px)] w-[clamp(9px,0.95vw,12px)] text-primary" />
              Dashboard
            </div>
            <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[clamp(9px,0.95vw,11px)] text-muted-foreground">
              <Calendar className="h-[clamp(9px,0.95vw,12px)] w-[clamp(9px,0.95vw,12px)]" />
              Events
            </div>
            <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[clamp(9px,0.95vw,11px)] text-muted-foreground">
              <SlidersHorizontal className="h-[clamp(9px,0.95vw,12px)] w-[clamp(9px,0.95vw,12px)]" />
              Studio
            </div>
            <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[clamp(9px,0.95vw,11px)] text-muted-foreground">
              <CreditCard className="h-[clamp(9px,0.95vw,12px)] w-[clamp(9px,0.95vw,12px)]" />
              Credits
            </div>
          </div>
        </aside>

        <main className="min-w-0 p-2.5">
          <div className="flex items-center justify-between border-b border-border/80 pb-2">
            <div className="inline-flex items-center gap-1.5">
              <LayoutDashboard className="h-[clamp(10px,1.05vw,13px)] w-[clamp(10px,1.05vw,13px)] text-muted-foreground" />
              <span className="text-[clamp(10px,1.1vw,12px)] font-medium text-foreground">Dashboard</span>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[clamp(9px,0.95vw,11px)] font-medium text-primary-foreground"
            >
              <CreditCard className="h-[clamp(9px,0.95vw,12px)] w-[clamp(9px,0.95vw,12px)]" />
              Buy Credits
            </button>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="overflow-hidden rounded-md border border-border bg-card">
              <div className="px-2 py-1.5">
                <p className="text-[clamp(9px,0.95vw,11px)] text-muted-foreground">Credit Balance</p>
                <p className="mt-0.5 text-[clamp(15px,2.1vw,24px)] font-semibold leading-none text-foreground">5748 credits</p>
              </div>
              <div className="flex items-center justify-between border-t border-border/80 px-2 py-1 text-[clamp(9px,0.95vw,11px)] text-muted-foreground">
                <span>1 credit per photo</span>
                <RefreshCw className="h-[clamp(9px,0.95vw,12px)] w-[clamp(9px,0.95vw,12px)]" />
              </div>
            </div>
            <div className="overflow-hidden rounded-md border border-border bg-card">
              <div className="px-2 py-1.5">
                <p className="text-[clamp(9px,0.95vw,11px)] text-muted-foreground">Total Photos</p>
                <p className="mt-0.5 text-[clamp(15px,2.1vw,24px)] font-semibold leading-none text-foreground">45</p>
              </div>
              <div className="flex items-center gap-1 border-t border-border/80 px-2 py-1 text-[clamp(9px,0.95vw,11px)] text-muted-foreground">
                <ImageIcon className="h-[clamp(9px,0.95vw,12px)] w-[clamp(9px,0.95vw,12px)]" />
                Across all events
              </div>
            </div>
            <div className="overflow-hidden rounded-md border border-border bg-card">
              <div className="px-2 py-1.5">
                <p className="text-[clamp(9px,0.95vw,11px)] text-muted-foreground">Total Faces</p>
                <p className="mt-0.5 text-[clamp(15px,2.1vw,24px)] font-semibold leading-none text-foreground">193</p>
              </div>
              <div className="flex items-center gap-1 border-t border-border/80 px-2 py-1 text-[clamp(9px,0.95vw,11px)] text-muted-foreground">
                <Smile className="h-[clamp(9px,0.95vw,12px)] w-[clamp(9px,0.95vw,12px)]" />
                Detected and indexed
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <p className="text-[clamp(11px,1.25vw,15px)] font-semibold text-foreground">Recent Events</p>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[clamp(9px,0.95vw,11px)] font-medium text-foreground"
            >
              <Calendar className="h-[clamp(9px,0.95vw,12px)] w-[clamp(9px,0.95vw,12px)]" />
              View All Events
            </button>
          </div>

          <div className="mt-1 overflow-hidden rounded-md border border-border bg-card">
            <div className="grid grid-cols-[20px_1.3fr_1fr_1fr_20px] items-center gap-2 border-b border-border px-2 py-1.5 text-[clamp(9px,0.95vw,11px)] font-medium text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-[4px] border border-border/90" />
              <span>Event Name</span>
              <span>Created</span>
              <span>Expires</span>
              <span />
            </div>
            {events.map((event) => (
              <div
                key={event.name}
                className="grid grid-cols-[20px_1.3fr_1fr_1fr_20px] items-center gap-2 border-b border-border/70 px-2 py-1.5 last:border-b-0"
              >
                <span className="h-2.5 w-2.5 rounded-[4px] border border-border/90" />
                <span className="truncate text-[clamp(10px,1.05vw,12px)] font-medium text-foreground">{event.name}</span>
                <span className="text-[clamp(10px,1.05vw,12px)] text-muted-foreground">{event.created}</span>
                <span className="text-[clamp(10px,1.05vw,12px)] text-muted-foreground">{event.expires}</span>
                <MoreHorizontal className="h-[clamp(10px,1.05vw,13px)] w-[clamp(10px,1.05vw,13px)] text-muted-foreground" />
              </div>
            ))}
          </div>
        </main>
      </div>
      </div>
    </div>
  );
}

// Default illustration gradients
const DEFAULT_GRADIENT_BASE =
  'linear-gradient(150deg, color-mix(in oklab, var(--primary-end) 18%, transparent) 0%, color-mix(in oklab, var(--primary) 12%, transparent) 42%, transparent 72%)';
const DEFAULT_GRADIENT_RADIAL =
  'radial-gradient(122% 96% at 8% 106%, color-mix(in oklab, var(--primary) 45%, transparent) 0%, color-mix(in oklab, var(--primary) 28%, transparent) 44%, color-mix(in oklab, var(--primary) 12%, transparent) 72%, transparent 97%), radial-gradient(122% 96% at 92% 106%, color-mix(in oklab, var(--primary-end) 45%, transparent) 0%, color-mix(in oklab, var(--primary-end) 28%, transparent) 44%, color-mix(in oklab, var(--primary-end) 12%, transparent) 72%, transparent 97%)';

const steps: Step[] = [
  {
    id: '01',
    label: 'Face search',
    title: 'Guests find themselves in seconds.',
    description: 'One selfie. AI matches faces and returns their photos instantly.',
    ctaLabel: 'Start free trial',
    pageGradient: STACKED_PRIMARY_END_GRADIENT,
    gradientBase: DEFAULT_GRADIENT_BASE,
    gradientRadial: DEFAULT_GRADIENT_RADIAL,
    Variant: FaceVariant,
  },
  {
    id: '02',
    label: 'LINE delivery',
    title: 'Share with a link guests already trust.',
    description: 'Send albums through LINE, plus QR for on-site scanning.',
    ctaLabel: 'Start free trial',
    pageGradient: STACKED_PRIMARY_END_GRADIENT,
    gradientBase: DEFAULT_GRADIENT_BASE,
    gradientRadial: DEFAULT_GRADIENT_RADIAL,
    Variant: LineVariant,
  },
  {
    id: '03',
    label: 'Auto color grading',
    title: 'Apply your look automatically.',
    description: 'Pick a Studio LUT per event and apply it during processing.',
    ctaLabel: 'Start free trial',
    pageGradient: STACKED_PRIMARY_END_GRADIENT,
    gradientBase: DEFAULT_GRADIENT_BASE,
    gradientRadial: DEFAULT_GRADIENT_RADIAL,
    Variant: ColorVariant,
  },
  {
    id: '04',
    label: 'Organizer UI',
    title: 'Stay in control from one dashboard.',
    description: 'Manage events, branding, and delivery without extra tools.',
    ctaLabel: 'Start free trial',
    pageGradient: STACKED_PRIMARY_END_GRADIENT,
    gradientBase: DEFAULT_GRADIENT_BASE,
    gradientRadial: DEFAULT_GRADIENT_RADIAL,
    Variant: DashboardVariant,
  },
];

export function FeatureStory() {
  const t = useTranslations('FeatureStory');
  const tFaceSearch = useTranslations('FeatureStory.faceSearch');
  const tLineDelivery = useTranslations('FeatureStory.lineDelivery');
  const tColorGrading = useTranslations('FeatureStory.colorGrading');
  const tDashboard = useTranslations('FeatureStory.dashboard');

  // Build face search step with i18n
  const faceSearchStep = {
    ...steps[0],
    label: tFaceSearch('label'),
    title: tFaceSearch('title'),
    description: tFaceSearch('description'),
    ctaLabel: tFaceSearch('cta'),
  };

  // Build line delivery step with i18n
  const lineDeliveryStep = {
    ...steps[1],
    label: tLineDelivery('label'),
    title: tLineDelivery('title'),
    description: tLineDelivery('description'),
    ctaLabel: tLineDelivery('cta'),
  };

  // Build color grading step with i18n
  const colorGradingStep = {
    ...steps[2],
    label: tColorGrading('label'),
    title: tColorGrading('title'),
    description: tColorGrading('description'),
    ctaLabel: tColorGrading('cta'),
  };

  // Build dashboard step with i18n
  const dashboardStep = {
    ...steps[3],
    label: tDashboard('label'),
    title: tDashboard('title'),
    description: tDashboard('description'),
    ctaLabel: tDashboard('cta'),
  };

  const allSteps = [faceSearchStep, lineDeliveryStep, colorGradingStep, dashboardStep];

  const faceSearchFeatures = [
    tFaceSearch('features.accuracy'),
    tFaceSearch('features.privacy'),
    tFaceSearch('features.pdpa'),
  ];

  const colorGradingFeatures = [
    tColorGrading('features.upload'),
    tColorGrading('features.automatic'),
    tColorGrading('features.consistent'),
  ];

  return (
    <section id="features" className="relative scroll-mt-24 bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-2 sm:pt-6">
        <div className="max-w-4xl">
          <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            {t('title')}
          </h2>
          <p className="mt-3 max-w-3xl text-base text-muted-foreground sm:text-lg">
            {t('subtitle')}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-20 md:pb-28">
        {allSteps.map((step, index) => (
          <article
            key={step.id}
            id={`feature-step-${step.id}`}
            className="relative isolate scroll-mt-24 overflow-visible sticky top-0 flex h-svh items-center py-0"
            style={{ zIndex: index + 1 }}
          >
            <div className="mx-auto h-[min(680px,calc(100svh-8rem))] w-full">
              <div className="relative z-10 h-full overflow-hidden rounded-3xl border border-border/90 bg-card shadow-[0_24px_62px_-42px_color-mix(in_oklab,var(--foreground)_36%,transparent)]">
                <div className="relative flex h-full flex-col lg:flex-row">
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col p-5 sm:p-7 lg:h-full lg:flex-1 lg:p-9">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="rounded-full border border-border bg-background px-2 py-1 text-xs">
                        {step.id} / 04
                      </span>
                      <span className="font-medium text-foreground">{step.label}</span>
                    </div>

                    <h3 className="mt-4 text-balance text-3xl font-semibold tracking-tight leading-[1.02] sm:text-[2.55rem]">
                      {step.title}
                    </h3>

                    <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
                      {step.description}
                    </p>

                    {/* Feature list for Face Search card */}
                    {step.id === '01' && (
                      <ul className="mt-4 hidden space-y-2 lg:block">
                        {faceSearchFeatures.map((feature) => (
                          <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Check className="h-4 w-4 text-primary" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Feature list for Color Grading card */}
                    {step.id === '03' && (
                      <ul className="mt-4 hidden space-y-2 lg:block">
                        {colorGradingFeatures.map((feature) => (
                          <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Check className="h-4 w-4 text-primary" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    )}

                    <a
                      href="https://app.framefast.io/sign-up"
                      className="mt-6 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted/50 lg:mt-auto"
                    >
                      {step.ctaLabel}
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </a>
                  </div>

                  <div className="relative h-[50svh] min-h-[15rem] max-h-[22rem] overflow-hidden sm:h-[50svh] sm:min-h-[17rem] sm:max-h-[25rem] lg:h-full lg:min-h-0 lg:max-h-none lg:min-w-0 lg:flex-1">
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundColor: 'var(--card)',
                        backgroundImage: step.gradientBase,
                      }}
                      aria-hidden="true"
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        background: step.gradientRadial,
                      }}
                      aria-hidden="true"
                    />
                    <div
                      className={
                        step.id === '04'
                          ? 'relative h-full pl-3 sm:pl-4 lg:pl-5'
                          : 'relative h-full px-3 pt-2 sm:px-4 sm:pt-3 lg:px-5 lg:pt-4'
                      }
                    >
                      <div className="h-full w-full">
                        <step.Variant />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}

        <section id="feature-story-end" className="h-[38svh] scroll-mt-24" />
      </div>
    </section>
  );
}
