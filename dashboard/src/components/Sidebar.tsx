import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Brain,
  ShieldCheck,
  ShieldAlert,
  Plug,
  BarChart3,
  ScrollText,
  Settings,
} from 'lucide-react'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/memories', label: 'Memories', icon: Brain },
  { to: '/validations', label: 'Validations', icon: ShieldCheck },
  { to: '/quarantine', label: 'Quarantine', icon: ShieldAlert },
  { to: '/connectors', label: 'Connectors', icon: Plug },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/audit', label: 'Audit Log', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside className="flex h-full w-60 flex-col bg-obsidian-surface-low">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-5">
        <img src="/icon.svg" alt="MemGuard" className="h-9 w-9 shrink-0" />
        <div className="min-w-0">
          <span className="font-headline text-base font-bold tracking-tight" style={{ color: '#c8d6e5' }}>
            mem<span style={{ color: '#4edea3' }}>guard</span>
          </span>
          <p className="text-[10px] font-medium text-obsidian-outline uppercase tracking-widest">Memory Validator</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-obsidian-outline-variant">Navigation</p>
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-sharp px-3 py-2.5 text-[13px] font-medium transition-all ${
                isActive
                  ? 'bg-obsidian-surface-high text-obsidian-primary'
                  : 'text-obsidian-on-surface-variant hover:bg-obsidian-surface-container hover:text-obsidian-on-surface'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={17}
                  className={
                    isActive
                      ? 'text-obsidian-primary'
                      : 'text-obsidian-outline group-hover:text-obsidian-on-surface-variant'
                  }
                />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-obsidian-secondary shadow-[0_0_6px_rgba(78,222,163,0.5)] animate-glow-pulse" />
          <span className="text-xs text-obsidian-on-surface-variant">System Online</span>
        </div>
        <p className="mt-1 text-[10px] text-obsidian-outline">v0.1.0</p>
      </div>
    </aside>
  )
}
