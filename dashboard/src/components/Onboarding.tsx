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
    <div className="flex flex-col items-center justify-center animate-fade-in" style={{ minHeight: '60vh' }}>
      <div
        className="w-full max-w-lg rounded-xl p-8"
        style={{
          backgroundColor: 'var(--color-surface-container)',
          boxShadow: 'var(--shadow-ambient)',
        }}
      >
        {/* Welcome heading */}
        <div className="text-center mb-8">
          <h1 className="font-headline text-3xl font-bold">
            <span style={{ color: '#c8d6e5' }}>Welcome to </span>
            <span style={{ color: '#c8d6e5' }}>mem</span>
            <span style={{ color: '#4edea3' }}>guard</span>
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-outline)' }}>
            Get started in 3 simple steps
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium" style={{ color: 'var(--color-outline)' }}>
              Setup progress
            </span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--color-on-surface)' }}>
              {completedCount}/3
            </span>
          </div>
          <div
            className="h-2 w-full rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--color-surface-container-highest)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${(completedCount / 3) * 100}%`,
                background: allDone
                  ? '#4edea3'
                  : 'linear-gradient(90deg, #adc6ff, #4edea3)',
              }}
            />
          </div>
        </div>

        {/* All done state */}
        {allDone ? (
          <div className="flex flex-col items-center py-6 animate-fade-in">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full mb-4"
              style={{ backgroundColor: 'rgba(78, 222, 163, 0.12)' }}
            >
              <PartyPopper size={32} style={{ color: '#4edea3' }} />
            </div>
            <h2 className="font-headline text-xl font-bold" style={{ color: '#4edea3' }}>
              You're all set!
            </h2>
            <p className="mt-2 text-sm text-center" style={{ color: 'var(--color-outline)' }}>
              Your memory systems are connected and validated. The dashboard will now show live data.
            </p>
          </div>
        ) : (
          /* Checklist steps */
          <div className="space-y-3">
            {STEPS.map((step, i) => {
              const isDone = completed[i]
              const Icon = step.icon
              return (
                <button
                  key={step.key}
                  onClick={() => navigate(step.path)}
                  className="flex w-full items-center gap-4 rounded-lg px-4 py-4 text-left transition-all"
                  style={{
                    backgroundColor: isDone
                      ? 'rgba(78, 222, 163, 0.06)'
                      : 'transparent',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (!isDone) e.currentTarget.style.backgroundColor = 'var(--color-surface-container-high)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isDone) e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  {/* Step number / check */}
                  <div className="shrink-0">
                    {isDone ? (
                      <CheckCircle2 size={22} style={{ color: '#4edea3' }} />
                    ) : (
                      <Circle size={22} style={{ color: 'var(--color-outline)' }} />
                    )}
                  </div>

                  {/* Icon + label */}
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: isDone
                        ? 'rgba(78, 222, 163, 0.10)'
                        : 'rgba(173, 198, 255, 0.08)',
                    }}
                  >
                    <Icon
                      size={18}
                      style={{
                        color: isDone ? '#4edea3' : 'var(--color-primary)',
                      }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium"
                      style={{
                        color: isDone
                          ? 'var(--color-outline)'
                          : 'var(--color-on-surface)',
                        textDecoration: isDone ? 'line-through' : 'none',
                      }}
                    >
                      {step.label}
                    </p>
                  </div>

                  {/* Arrow hint for incomplete steps */}
                  {!isDone && (
                    <span className="text-xs font-medium shrink-0" style={{ color: 'var(--color-primary)' }}>
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
