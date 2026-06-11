import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Brain,
  ShieldCheck,
  ShieldAlert,
  Plug,
  BarChart3,
  ScrollText,
  Settings,
  Search,
  CornerDownLeft,
} from 'lucide-react'

interface Command {
  label: string
  hint: string
  to: string
  icon: typeof Search
  keywords: string
}

const COMMANDS: Command[] = [
  { label: 'Overview', hint: 'Health, alerts, recent activity', to: '/', icon: LayoutDashboard, keywords: 'dashboard home health' },
  { label: 'Memories', hint: 'Browse tracked memories and trust scores', to: '/memories', icon: Brain, keywords: 'facts trust records' },
  { label: 'Flagged memories', hint: 'Memories with degraded trust', to: '/memories?status=flagged', icon: Brain, keywords: 'flagged review attention' },
  { label: 'Validations', hint: 'Run and monitor validation jobs', to: '/validations', icon: ShieldCheck, keywords: 'jobs run verify check' },
  { label: 'Quarantine', hint: 'Review and remediate quarantined memories', to: '/quarantine', icon: ShieldAlert, keywords: 'stale contradicted restore' },
  { label: 'Analytics', hint: 'Staleness heatmaps and trends', to: '/analytics', icon: BarChart3, keywords: 'charts trends staleness' },
  { label: 'Audit Log', hint: 'Tamper-evident event trail', to: '/audit', icon: ScrollText, keywords: 'events history integrity' },
  { label: 'Connectors', hint: 'Connect Mem0, Zep, Letta, LangMem', to: '/connectors', icon: Plug, keywords: 'mem0 zep letta sync sources' },
  { label: 'Settings', hint: 'Thresholds, API keys', to: '/settings', icon: Settings, keywords: 'config thresholds api key' },
]

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMANDS
    return COMMANDS.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.hint.toLowerCase().includes(q) ||
        c.keywords.includes(q),
    )
  }, [query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // Focus after the dialog renders
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => setActive(0), [query])

  const run = useCallback(
    (cmd: Command) => {
      navigate(cmd.to)
      onClose()
    },
    [navigate, onClose],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => Math.min(a + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => Math.max(a - 1, 0))
      } else if (e.key === 'Enter' && results[active]) {
        e.preventDefault()
        run(results[active])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, results, active, onClose, run])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[14vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[#1d1b14]/30 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-md border border-ledger-outline-variant bg-ledger-surface shadow-lifted animate-slide-up">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-ledger-outline-variant px-4 py-3">
          <Search size={16} className="shrink-0 text-ledger-outline" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Go to page or action…"
            className="w-full bg-transparent text-sm text-ledger-on-surface outline-none placeholder:text-ledger-outline"
          />
          <kbd className="mono shrink-0 rounded-sharp border border-ledger-outline-variant px-1.5 py-0.5 text-[10px] text-ledger-outline">
            esc
          </kbd>
        </div>

        {/* Results */}
        <ul className="max-h-[320px] overflow-y-auto py-1.5">
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ledger-on-surface-variant">
              Nothing in the ledger matches &ldquo;{query}&rdquo;
            </li>
          )}
          {results.map((cmd, i) => {
            const Icon = cmd.icon
            return (
              <li key={cmd.to + cmd.label}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(cmd)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === active ? 'bg-ledger-surface-high' : ''
                  }`}
                >
                  <Icon size={15} className={i === active ? 'text-ledger-primary' : 'text-ledger-outline'} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-ledger-on-surface">{cmd.label}</span>
                    <span className="block truncate text-xs text-ledger-on-surface-variant">{cmd.hint}</span>
                  </span>
                  {i === active && <CornerDownLeft size={13} className="shrink-0 text-ledger-outline" />}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center gap-3 border-t border-ledger-outline-variant px-4 py-2">
          <span className="mono text-[10px] text-ledger-outline">↑↓ navigate</span>
          <span className="mono text-[10px] text-ledger-outline">↵ open</span>
        </div>
      </div>
    </div>
  )
}
