import * as React from 'react';
import { Slider as SliderPrimitive } from 'radix-ui';
import { Pipette } from 'lucide-react';

import { cn } from '../../utils/ui';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

function HueSlider({
  className,
  value,
  onValueChange,
  min = 0,
  max = 360,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      value={value}
      onValueChange={onValueChange}
      min={min}
      max={max}
      className={cn(
        'data-vertical:min-h-40 relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:w-auto data-vertical:flex-col',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="rounded-md relative grow overflow-hidden h-3 w-full"
        style={{
          background: `linear-gradient(to right,
            hsl(0, 100%, 50%),
            hsl(60, 100%, 50%),
            hsl(120, 100%, 50%),
            hsl(180, 100%, 50%),
            hsl(240, 100%, 50%),
            hsl(300, 100%, 50%),
            hsl(360, 100%, 50%))`,
        }}
      />
      {Array.isArray(value)
        ? value.map((_, index) => (
            <SliderPrimitive.Thumb
              data-slot="slider-thumb"
              key={index}
              className="border-background ring-ring/30 size-4 rounded-full border-2 bg-primary shadow-sm transition-colors hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden block shrink-0 select-none disabled:pointer-events-none disabled:opacity-50"
            />
          ))
        : null}
    </SliderPrimitive.Root>
  );
}

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  const [hsv, setHsv] = React.useState(() => hexToHsv(value));
  const [isOpen, setIsOpen] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);

  const handleHueChange = (h: number[]) => {
    const newHsv = { ...hsv, h: h[0] };
    setHsv(newHsv);
    onChange(hsvToHex(newHsv));
  };

  const updateSaturationValue = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const newHsv = { ...hsv, s: x, v: 1 - y };
    setHsv(newHsv);
    onChange(hsvToHex(newHsv));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    updateSaturationValue(e);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      updateSaturationValue(e);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      onChange(hex);
    }
  };

  const handleEyeDropper = async () => {
    if ('EyeDropper' in window) {
      const eyeDropper = new (window as any).EyeDropper();
      try {
        const result = await eyeDropper.open();
        onChange(result.sRGBHex);
      } catch (e) {
        console.log('EyeDropper cancelled');
      }
    }
  };

  const hexValue = hsvToHex(hsv);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('w-full justify-between gap-2 px-2 py-2', className)}
        >
          <div className="size-4 rounded-sm" style={{ backgroundColor: hexValue }} />
          <span className="text-xs font-normal">{hexValue.toUpperCase()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              <Input value={hexValue.toUpperCase()} onChange={handleHexChange} className="flex-1" />
              <Button
                variant="outline"
                size="icon"
                onClick={handleEyeDropper}
                disabled={!('EyeDropper' in window)}
                title="Pick color from screen"
              >
                <Pipette className="size-4" />
              </Button>
            </div>
          </div>

          <div
            className="relative size-full h-32 cursor-crosshair rounded-md"
            style={{
              backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div
              className="absolute inset-0 rounded-md"
              style={{
                background: `linear-gradient(to right, #fff, transparent)`,
              }}
            />
            <div
              className="absolute inset-0 rounded-md"
              style={{
                background: `linear-gradient(to bottom, transparent, #000)`,
              }}
            />
            <div
              className="absolute size-3.5 -ml-1.5 -mt-1.5 rounded-full border-2 border-white shadow-sm"
              style={{
                left: `${hsv.s * 100}%`,
                top: `${(1 - hsv.v) * 100}%`,
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Hue</Label>
            <HueSlider
              value={[hsv.h]}
              onValueChange={handleHueChange}
              min={0}
              max={360}
              step={1}
              className="h-4"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(rgb: [number, number, number]): string {
  return (
    '#' +
    rgb
      .map((x) => {
        const hex = Math.min(255, Math.max(0, x)).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')
  );
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const [r, g, b] = hexToRgb(hex);
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    switch (max) {
      case rNorm:
        h = ((gNorm - bNorm) / d) % 6;
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
  }
  h = (h * 60 + 360) % 360;

  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;

  return { h, s: s / 100, v: v / 100 };
}

function hsvToHex(hsv: { h: number; s: number; v: number }): string {
  const h = hsv.h / 360;
  const s = hsv.s;
  const v = hsv.v;

  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let rNorm: number, gNorm: number, bNorm: number;

  switch (i % 6) {
    case 0:
      rNorm = v;
      gNorm = t;
      bNorm = p;
      break;
    case 1:
      rNorm = q;
      gNorm = v;
      bNorm = p;
      break;
    case 2:
      rNorm = p;
      gNorm = v;
      bNorm = t;
      break;
    case 3:
      rNorm = p;
      gNorm = q;
      bNorm = v;
      break;
    case 4:
      rNorm = t;
      gNorm = p;
      bNorm = v;
      break;
    case 5:
      rNorm = v;
      gNorm = p;
      bNorm = q;
      break;
    default:
      rNorm = v;
      gNorm = t;
      bNorm = p;
  }

  const r = Math.round(rNorm * 255);
  const g = Math.round(gNorm * 255);
  const b = Math.round(bNorm * 255);

  return rgbToHex([r, g, b]);
}

export { ColorPicker };
