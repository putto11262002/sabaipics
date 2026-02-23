// Server Component - shell renders immediately, animated overlays after hydration
import { HeroEventStageAnimated } from './hero-event-stage-animated';
import { HeroEventStageShell } from './hero-event-stage-shell';

export function HeroEventStage({ className }: { className?: string }) {
  return (
    <div className="relative w-full">
      {/* Static shell - renders immediately in SSR HTML (instant LCP) */}
      <div className="absolute inset-0">
        <HeroEventStageShell className={className} />
      </div>

      {/* Animated overlay - hydrates on client */}
      <HeroEventStageAnimated className={className} />
    </div>
  );
}
