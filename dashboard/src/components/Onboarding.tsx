import { useNavigate } from 'react-router-dom'
import { Plug, RefreshCw, ShieldCheck, CheckCircle2, Circle, PartyPopper } from 'lucide-react'

interface OnboardingProps {
  hasConnectors: boolean
  hasMemories: boolean
  hasValidations: boolean
}

const STEPS = [
  {
    key: 'connectors',
    label: 'Connect a memory system',
    icon: Plug,
    path: '/connectors',
  },
  {
    key: 'memories',
    label: 'Sync your first memories',
    icon: RefreshCw,
    path: '/connectors',
  },
  {
    key: 'validations',
    label: 'Run your first validation',
    icon: ShieldCheck,
    path: '/validations',
  },
] as const

export default function Onboarding({ hasConnectors, hasMemories, hasValidations }: OnboardingProps) {
  const navigate = useNavigate()
  const completed = [hasConnectors, hasMemories, hasValidations]
  const completedCount = completed.filter(Boolean).length
  const allDone = completedCount === 3

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center animate-fade-in">
      <div className="card w-full max-w-lg p-8">
        {/* Registration heading */}
        <div className="mb-8 text-center">
          <p className="ledger-no">Registration</p>
          <h1 className="mt-1 font-headline text-3xl font-semibold text-ledger-on-surface">
            Welcome to MemGuard
          </h1>
          <p className="mono mt-2 text-[11px] uppercase tracking-[0.12em] text-ledger-on-surface-variant">
            Get started in 3 steps
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-ledger-on-surface-variant">
              Setup progress
            </span>
            <span className="mono text-xs font-semibold tabular-nums text-ledger-on-surface">
              {completedCount}/3
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full border border-ledger-outline-variant bg-ledger-surface-lowest">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                allDone ? 'bg-ledger-secondary' : 'bg-ledger-primary'
              }`}
              style={{ width: `${(completedCount / 3) * 100}%` }}
            />
          </div>
        </div>

        {/* All done state */}
        {allDone ? (
          <div className="flex flex-col items-center py-6 animate-fade-in">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-ledger-secondary/30 bg-ledger-secondary/[0.08]">
              <PartyPopper size={32} className="text-ledger-secondary" />
            </div>
            <h2 className="font-headline text-xl font-semibold text-ledger-secondary">
              You're all set!
            </h2>
            <p className="mt-2 text-center text-sm text-ledger-on-surface-variant">
              Your memory systems are connected and validated. The dashboard will now show live data.
            </p>
          </div>
        ) : (
          /* Checklist steps — ruled ledger rows */
          <div>
            {STEPS.map((step, i) => {
              const isDone = completed[i]
              const Icon = step.icon
              return (
                <button
                  key={step.key}
                  onClick={() => navigate(step.path)}
                  className={`flex w-full cursor-pointer items-center gap-4 border-b border-[rgba(29,27,20,0.12)] px-3 py-4 text-left transition-colors last:border-b-0 ${
                    isDone ? 'bg-ledger-secondary/[0.05]' : 'hover:bg-ledger-surface-low'
                  }`}
                >
                  {/* Step check */}
                  <div className="shrink-0">
                    {isDone ? (
                      <CheckCircle2 size={22} className="text-ledger-secondary" />
                    ) : (
                      <Circle size={22} className="text-ledger-outline" />
                    )}
                  </div>

                  {/* Icon */}
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sharp border ${
                      isDone
                        ? 'border-ledger-secondary/25 bg-ledger-secondary/[0.08]'
                        : 'border-ledger-outline-variant bg-ledger-surface-low'
                    }`}
                  >
                    <Icon size={18} className={isDone ? 'text-ledger-secondary' : 'text-ledger-primary'} />
                  </div>

                  {/* Label */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium ${
                        isDone ? 'text-ledger-on-surface-variant line-through' : 'text-ledger-on-surface'
                      }`}
                    >
                      {step.label}
                    </p>
                  </div>

                  {/* Arrow hint for incomplete steps */}
                  {!isDone && (
                    <span className="mono shrink-0 text-xs font-medium text-ledger-primary">
                      Go &rarr;
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
