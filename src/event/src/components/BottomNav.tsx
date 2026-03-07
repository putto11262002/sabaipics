import { NavLink } from 'react-router';
import { Images, Search, Settings } from 'lucide-react';

interface BottomNavProps {
  eventId: string;
}

const tabs: Array<{ label: string; icon: typeof Search; path: (eventId: string) => string; primary?: boolean }> = [
  { label: 'รูปของฉัน', icon: Images, path: (id) => `/${id}/photos` },
  { label: 'ค้นหา', icon: Search, path: (id) => `/${id}/search`, primary: true },
  { label: 'ตั้งค่า', icon: Settings, path: (id) => `/${id}/settings` },
];

export function BottomNav({ eventId }: BottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background">
      <div className="flex">
        {tabs.map(({ label, icon: Icon, path, primary }) => (
          <NavLink
            key={label}
            to={path(eventId)}
            replace
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
                primary && isActive
                  ? 'text-primary'
                  : isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`size-5 ${primary && isActive ? 'text-primary' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
