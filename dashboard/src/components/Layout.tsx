import { useState, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Sidebar from './Sidebar'
import CommandPalette from './CommandPalette'
import { fetchHealthScore } from '../api/client'
import { Menu, X, Search } from 'lucide-react'

function HealthPill() {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['health-score'],
    queryFn: fetchHealthScore,
    refetchInterval: 30_000,
    retry: false,
  })

  if (!data) return null
  const pct = Math.round(data.overall_score * 100)
  const tone =
    pct >= 70
      ? 'text-ledger-secondary border-ledger-secondary/40 bg-ledger-secondary/5'
      : pct >= 40
        ? 'text-ledger-tertiary border-ledger-tertiary/40 bg-ledger-tertiary/5'
        : 'text-ledger-error border-ledger-error/40 bg-ledger-error-container/60'

  return (
    <button
      onClick={() => navigate('/analytics')}
      className={`stamp ${tone} transition-transform hover:-translate-y-px`}
      title="Overall memory health — view analytics"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      health {pct}%
    </button>
  )
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="flex h-screen overflow-hidden bg-ledger-background">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#1d1b14]/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile, slide-in when toggled */}
      <div
        className={`
        fixed inset-y-0 left-0 z-50 w-60 transform transition-transform duration-200 ease-out
        lg:relative lg:translate-x-0 lg:z-auto
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
      >
        <Sidebar onNavigate={() => setMobileOpen(false)} />
      </div>

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ledger-outline-variant bg-ledger-surface-low px-4 sm:px-6">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-sharp p-1.5 text-ledger-on-surface-variant transition-colors hover:bg-ledger-surface-high hover:text-ledger-on-surface lg:hidden"
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <span className="mono hidden text-[11px] uppercase tracking-[0.14em] text-ledger-outline sm:block">
            Ledger of record — {today}
          </span>

          <div className="ml-auto flex items-center gap-2.5">
            <HealthPill />
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 rounded-sharp border border-ledger-outline-variant bg-ledger-surface px-2.5 py-1.5 text-xs text-ledger-on-surface-variant transition-colors hover:border-ledger-outline hover:text-ledger-on-surface"
            >
              <Search size={13} />
              <span className="hidden sm:inline">Jump to…</span>
              <kbd className="mono rounded-sharp border border-ledger-outline-variant bg-ledger-surface-low px-1 text-[10px] leading-4 text-ledger-outline">
                ⌘K
              </kbd>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
