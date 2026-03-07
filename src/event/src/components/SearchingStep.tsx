import { Search } from 'lucide-react';
import { th } from '../lib/i18n';

export function SearchingStep() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="space-y-8 text-center">
        {/* Animated magnifying glass */}
        <div className="relative mx-auto h-32 w-32">
          {/* Scan lines behind the glass */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-20 w-20 animate-ping rounded-full bg-primary/10" style={{ animationDuration: '2s' }} />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-14 w-14 animate-ping rounded-full bg-primary/5" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
          </div>

          {/* Magnifying glass icon — moves in a search pattern */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              animation: 'searchDrift 3s ease-in-out infinite',
            }}
          >
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
              style={{
                animation: 'searchTilt 2s ease-in-out infinite',
              }}
            >
              <Search className="size-8 text-primary" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{th.searching.title}</h1>
          <p className="text-sm text-muted-foreground">{th.searching.wait}</p>
        </div>
      </div>

      <style>{`
        @keyframes searchDrift {
          0%, 100% { transform: translate(0, 0); }
          20% { transform: translate(12px, -8px); }
          40% { transform: translate(-10px, -12px); }
          60% { transform: translate(-14px, 6px); }
          80% { transform: translate(10px, 10px); }
        }
        @keyframes searchTilt {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-12deg); }
          75% { transform: rotate(12deg); }
        }
      `}</style>
    </div>
  );
}
