// Shared hardware UI components for camera illustration
// Used by both hero-event-stage-animated.tsx and hero-event-stage-shell.tsx

export function HardwareButton() {
  return (
    <div
      className="relative rounded-full border border-foreground lg:border-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.74),inset_0_-1px_0_rgba(255,255,255,0.24)]"
      style={{
        width: 'clamp(1.55rem, 3vw, 2.55rem)',
        height: 'clamp(1.55rem, 3vw, 2.55rem)',
      }}
      aria-hidden="true"
    >
      <div className="absolute rounded-full border border-foreground lg:border-2" style={{ inset: '18%' }} />
    </div>
  );
}

export function HardwareDial() {
  return (
    <div
      className="relative rounded-full border border-foreground lg:border-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.74),inset_0_-1px_0_rgba(255,255,255,0.24)]"
      style={{
        width: 'clamp(2.55rem, 5vw, 4.55rem)',
        height: 'clamp(2.55rem, 5vw, 4.55rem)',
      }}
      aria-hidden="true"
    >
      <div className="absolute rounded-full border border-foreground lg:border-2" style={{ inset: '12%' }} />
      <div
        className="absolute rounded-full border border-foreground lg:border-2"
        style={{ inset: '32%', background: 'rgba(255,255,255,0.26)' }}
      />
      <div className="absolute left-1/2 top-1.5 h-2 w-px -translate-x-1/2 rounded-full bg-primary/25" />
    </div>
  );
}
