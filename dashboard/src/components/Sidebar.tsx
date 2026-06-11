import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchMemoryStats } from '../api/client'
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

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  badge?: 'flagged' | 'quarantined'
}

const groups: { title: string; items: NavItem[] }[] = [
  {
    title: 'Monitor',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard },
      { to: '/memories', label: 'Memories', icon: Brain, badge: 'flagged' },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Operate',
    items: [
      { to: '/validations', label: 'Validations', icon: ShieldCheck },
      { to: '/quarantine', label: 'Quarantine', icon: ShieldAlert, badge: 'quarantined' },
      { to: '/audit', label: 'Audit Log', icon: ScrollText },
    ],
  },
  {
    title: 'Configure',
    items: [
      { to: '/connectors', label: 'Connectors', icon: Plug },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { data: stats } = useQuery({
    queryKey: ['memoryStats'],
    queryFn: fetchMemoryStats,
    refetchInterval: 30_000,
    retry: false,
  })

  const counts: Record<string, number> = {
    flagged: stats?.flagged ?? 0,
    quarantined: stats?.quarantined ?? 0,
  }

  return (
    <aside className="flex h-full w-60 flex-col border-r border-ledger-outline-variant bg-ledger-surface-low">
      {/* Brand block */}
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="MemGuard" className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <span className="font-headline text-lg font-semibold tracking-tight text-ledger-on-surface">
              MemGuard
            </span>
            <p className="ledger-no mt-0.5">Trust Ledger</p>
          </div>
        </div>
        <div className="ledger-rule mt-4" />
      </div>

      {/* Grouped nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="ledger-no mb-1.5 px-3">{group.title}</p>
            {group.items.map(({ to, label, icon: Icon, badge }) => {
              const count = badge ? counts[badge] : 0
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-sharp px-3 py-2 text-[13px] transition-all ${
                      isActive
                        ? 'bg-ledger-surface-high font-semibold text-ledger-on-surface'
                        : 'font-medium text-ledger-on-surface-variant hover:bg-ledger-surface-high/60 hover:text-ledger-on-surface'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* Active rule — ink tick in the left margin */}
                      <span
                        className={`absolute -left-3 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full transition-all ${
                          isActive ? 'bg-ledger-primary' : 'bg-transparent'
                        }`}
                      />
                      <Icon
                        size={16}
                        strokeWidth={isActive ? 2.25 : 1.75}
                        className={
                          isActive
                            ? 'text-ledger-primary'
                            : 'text-ledger-outline group-hover:text-ledger-on-surface-variant'
                        }
                      />
                      <span className="flex-1">{label}</span>
                      {badge && count > 0 && (
                        <span
                          className={`mono rounded-sharp px-1.5 text-[10px] font-semibold leading-[18px] ${
                            badge === 'quarantined'
                              ? 'bg-ledger-error-container text-ledger-error'
                              : 'bg-[#f5e7cf] text-ledger-tertiary'
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-ledger-outline-variant px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-ledger-secondary animate-glow-pulse" />
          <span className="mono text-[11px] text-ledger-on-surface-variant">ledger online</span>
          <span className="mono ml-auto text-[10px] text-ledger-outline">v0.2.0</span>
        </div>
      </div>
    </aside>
  )
}
