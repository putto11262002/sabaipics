'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Smartphone, Globe, Monitor, Aperture } from 'lucide-react';

const searchMessages = [
  'AI-powered face search...',
  '98% accuracy matching...',
  'Privacy-first, always...',
];

// Face Search Tile - Grid fills entire card, text overlays with gradient
function FaceSearchTile() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % searchMessages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border">
      {/* Tilted photo grid - fills entire card */}
      <div
        className="absolute inset-0 -bottom-8 -left-8 -right-8"
        style={{ transform: 'rotate(-6deg)' }}
      >
        {/* Purple gradient background behind the grid */}
        <div className="absolute inset-0 bg-gradient-to-t from-primary-accent/40 via-primary-accent/20 via-50% to-transparent" />

        {/* Grid on top */}
        <div className="relative grid grid-cols-6 gap-1.5">
          {[...Array(42)].map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-md border border-border bg-background shadow-sm"
            />
          ))}
        </div>
      </div>

      {/* Text overlay with white gradient fade */}
      <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-card from-40% to-transparent p-5 pb-16">
        <h3 className="text-lg font-semibold tracking-tight">Face search</h3>
        <p className="mt-1 text-muted-foreground">
          Attendees find their photos instantly with a selfie.
        </p>
      </div>

      {/* Search bar + selfie - floating on top */}
      <div className="absolute bottom-8 left-1/2 z-10 w-[70%] -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 shadow-lg">
          {/* Selfie circle with face icon */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
            <svg className="h-5 w-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
            </svg>
          </div>
          {/* Animated cycling text */}
          <div className="relative h-6 flex-1 overflow-hidden">
            {searchMessages.map((msg, i) => (
              <span
                key={msg}
                className="absolute inset-0 text-base font-medium text-muted-foreground transition-all duration-500 ease-in-out"
                style={{
                  transform: `translateY(${(i - messageIndex) * 100}%)`,
                  opacity: i === messageIndex ? 1 : 0,
                }}
              >
                {msg}
              </span>
            ))}
          </div>
          {/* Loading spinner */}
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      </div>
    </div>
  );
}

// Upload Ways Tile - Custom card like Face Search
function UploadWaysTile() {
  const ways = [
    { label: 'iOS + WiFi', description: 'Connect and transfer on-site', icon: Smartphone },
    { label: 'Browser', description: 'Drag & drop quick batches', icon: Globe },
    { label: 'Desktop', description: 'Stable bulk uploads', icon: Monitor },
    { label: 'Lightroom', description: 'Auto-export while editing', icon: Aperture },
  ];

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border">
      {/* Primary accent gradient - bottom to top */}
      <div className="absolute inset-0 bg-gradient-to-t from-primary-accent/40 via-primary-accent/15 via-50% to-card to-70%" />

      {/* Upload methods list */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 ps-2">
        {ways.map((way) => {
          const Icon = way.icon;
          return (
            <div
              key={way.label}
              className="flex items-center gap-3 bg-background px-4 py-2"
            >
              <Icon className="h-5 w-5 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-base font-medium">{way.label}</span>
                <span className="text-sm text-muted-foreground">{way.description}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Text overlay with gradient fade */}
      <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-card from-40% to-transparent p-5 pb-16">
        <h3 className="text-lg font-semibold tracking-tight">Upload your way</h3>
        <p className="mt-1 text-muted-foreground">
          iOS WiFi, browser, desktop, or Lightroom.
        </p>
      </div>
    </div>
  );
}

// LINE Tile - Custom card
function LineTile() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border bg-card">
      {/* Phone UI coming from bottom right */}
      <div className="absolute top-24 -right-2 w-[70%]">
        {/* Phone frame */}
        <div className="rounded-3xl border-2 border-border bg-muted p-2">
          {/* Phone notch */}
          <div className="mx-auto mb-2 h-1.5 w-16 rounded-full bg-border" />

          {/* Phone screen */}
          <div className="flex h-72 flex-col rounded-2xl bg-background">
            {/* Chat header */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <div className="h-6 w-6 rounded-full bg-muted" />
              <div className="h-2 w-16 rounded bg-muted" />
            </div>

            {/* Chat messages */}
            <div className="flex flex-1 flex-col gap-3 p-3 pt-6 pr-1">
              {/* Outgoing: Selfie search request */}
              <div className="ml-auto flex items-center gap-2 rounded-2xl rounded-br-sm bg-muted px-3 py-2">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background">
                  <svg className="h-3 w-3 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                  </svg>
                </div>
                <span className="text-xs font-medium">Find my photos</span>
                <div className="h-3 w-3 animate-spin rounded-full border border-muted-foreground/30 border-t-primary" />
              </div>

              {/* Incoming: Image results */}
              <div className="flex gap-1">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square w-12 shrink-0 rounded-md border border-border bg-muted"
                  />
                ))}
              </div>
            </div>

            {/* Chat input */}
            <div className="border-t border-border px-3 py-2">
              <div className="h-6 rounded-full bg-muted" />
            </div>
          </div>
        </div>
      </div>

      {/* Text overlay with gradient fade */}
      <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-card from-40% to-transparent p-5 pb-16">
        <h3 className="text-lg font-semibold tracking-tight">LINE delivery</h3>
        <p className="mt-1 text-muted-foreground">
          Share links that just work.
        </p>
      </div>
    </div>
  );
}

// Branding Tile - Custom card
function BrandingTile() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border bg-card">
      {/* Control list items */}
      <div className="absolute inset-x-0 top-[60%] -translate-y-1/2 flex flex-col gap-3 p-3">
        {/* Logo control */}
        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
          <span className="text-xs text-muted-foreground">Logo</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">LOGO</span>
            <svg className="h-3 w-3 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </div>
        </div>

        {/* Color control */}
        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
          <span className="text-xs text-muted-foreground">Color</span>
          <div className="flex gap-1.5">
            <div className="h-3.5 w-3.5 rounded-full bg-primary-accent/40 ring-1 ring-primary-accent/30" />
            <div className="h-3.5 w-3.5 rounded-full bg-foreground/30" />
            <div className="h-3.5 w-3.5 rounded-full bg-muted-foreground/30" />
          </div>
        </div>

        {/* Opacity control */}
        <div className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2">
          <span className="text-xs text-muted-foreground">Opacity</span>
          <div className="flex flex-1 items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-muted-foreground/20">
              <div className="h-full w-3/4 rounded-full bg-primary-accent/40" />
            </div>
            <span className="text-[10px] text-muted-foreground">75%</span>
          </div>
        </div>

        {/* Position control */}
        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
          <span className="text-xs text-muted-foreground">Position</span>
          <div className="grid grid-cols-3 gap-0.5">
            {[...Array(9)].map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-sm ${i === 8 ? 'bg-primary-accent/40' : 'bg-muted-foreground/20'}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Text overlay with gradient fade */}
      <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-card from-40% to-transparent p-5 pb-12">
        <h3 className="text-lg font-semibold tracking-tight">Your branding</h3>
        <p className="mt-1 text-muted-foreground">
          Watermarks and styling that match your studio.
        </p>
      </div>
    </div>
  );
}

// Organizer Tile - Custom card with laptop mockup
function OrganizerTile() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border bg-card">
      {/* Laptop coming from bottom left */}
      <div className="absolute top-32 -left-16 w-[110%]">
        {/* Laptop lid/screen - 16:10 aspect ratio */}
        <div className="aspect-[16/10] rounded-t-md border-2 border-border bg-foreground/10 p-1">
          {/* Screen bezel */}
          <div className="flex h-full gap-1 rounded-sm bg-background p-1">
            {/* Sidebar */}
            <div className="flex w-8 shrink-0 flex-col gap-1.5 rounded-sm bg-muted p-1">
              <div className="h-2 w-2 rounded-full bg-primary-accent/50" />
              <div className="h-1 w-full rounded bg-muted-foreground/20" />
              <div className="h-1 w-full rounded bg-muted-foreground/30" />
              <div className="h-1 w-full rounded bg-muted-foreground/20" />
              <div className="h-1 w-full rounded bg-muted-foreground/20" />
            </div>

            {/* Main content */}
            <div className="flex flex-1 flex-col gap-1.5 p-1">
              {/* Top nav */}
              <div className="flex items-center gap-2">
                <div className="h-1 w-8 rounded bg-muted-foreground/30" />
                <div className="h-1 w-6 rounded bg-muted-foreground/20" />
                <div className="ml-auto flex gap-1">
                  <div className="h-2 w-2 rounded-full bg-muted" />
                  <div className="h-2 w-2 rounded-full bg-muted" />
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-1">
                {['248', '1.2k', '89%', '12'].map((stat, i) => (
                  <div key={i} className="rounded bg-muted p-1 text-center">
                    <div className="text-[8px] font-medium">{stat}</div>
                    <div className="mx-auto mt-0.5 h-0.5 w-3 rounded bg-muted-foreground/20" />
                  </div>
                ))}
              </div>

              {/* Mini chart area */}
              <div className="flex flex-1 gap-1">
                {/* Table */}
                <div className="flex-1 rounded bg-muted p-1">
                  <div className="mb-1 flex gap-1">
                    <div className="h-1 w-6 rounded bg-muted-foreground/30" />
                    <div className="h-1 w-4 rounded bg-muted-foreground/20" />
                    <div className="h-1 w-5 rounded bg-muted-foreground/20" />
                  </div>
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-1 py-0.5">
                      <div className="h-1.5 w-1.5 rounded-sm bg-muted-foreground/20" />
                      <div className="h-0.5 flex-1 rounded bg-muted-foreground/15" />
                      <div className="h-0.5 w-3 rounded bg-primary-accent/40" />
                    </div>
                  ))}
                </div>

                {/* Side panel */}
                <div className="w-10 rounded bg-muted p-1">
                  <div className="mb-1 h-1 w-full rounded bg-muted-foreground/20" />
                  <div className="flex flex-col gap-0.5">
                    {[60, 80, 45, 90].map((h, i) => (
                      <div key={i} className="flex items-center gap-0.5">
                        <div
                          className="h-1 rounded bg-primary-accent/30"
                          style={{ width: `${h}%` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Laptop base/keyboard */}
        <div className="relative">
          <div className="h-3 rounded-b-md border-2 border-t-0 border-border bg-foreground/10" />
          {/* Trackpad hint */}
          <div className="absolute inset-x-1/3 top-0.5 h-1.5 rounded-sm bg-border" />
        </div>
      </div>

      {/* Text overlay with gradient fade */}
      <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-card from-40% to-transparent p-5 pb-12">
        <h3 className="text-lg font-semibold tracking-tight">Organizer ready</h3>
        <p className="mt-1 text-muted-foreground">
          Dashboard to manage events and track delivery.
        </p>
      </div>
    </div>
  );
}

export function BentoFeatures() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-4 py-16">
      <div className="mb-10 max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Everything you need to deliver event photos
        </h2>
        <p className="mt-2 text-muted-foreground">
          From shoot to share, without the hassle.
        </p>
      </div>

      {/* Bento Grid */}
      <div className="grid gap-6">
        {/* Top row - 2 equal columns */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Face Search - custom tile */}
          <div className="min-h-[350px]">
            <FaceSearchTile />
          </div>

          {/* Upload Ways - custom tile */}
          <div className="min-h-[350px]">
            <UploadWaysTile />
          </div>
        </div>

        {/* Bottom row - 3 columns */}
        <div className="grid min-h-[350px] gap-4 md:grid-cols-3">
          {/* LINE - custom tile */}
          <LineTile />

          {/* Branding - custom tile */}
          <BrandingTile />

          {/* Organizer - custom tile */}
          <OrganizerTile />
        </div>
      </div>
    </section>
  );
}
