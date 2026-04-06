const styles: Record<string, { bg: string; text: string }> = {
  active:       { bg: 'bg-[#4edea3]/10', text: 'text-[#4edea3]' },
  verified:     { bg: 'bg-[#4edea3]/10', text: 'text-[#4edea3]' },
  completed:    { bg: 'bg-[#4edea3]/10', text: 'text-[#4edea3]' },
  healthy:      { bg: 'bg-[#4edea3]/10', text: 'text-[#4edea3]' },
  flagged:      { bg: 'bg-[#ffb95f]/10', text: 'text-[#ffb95f]' },
  running:      { bg: 'bg-[#adc6ff]/10', text: 'text-[#adc6ff]' },
  pending:      { bg: 'bg-[#c5c6cd]/10', text: 'text-[#c5c6cd]' },
  quarantined:  { bg: 'bg-[#ffb4ab]/10', text: 'text-[#ffb4ab]' },
  invalidated:  { bg: 'bg-[#8f9097]/10', text: 'text-[#8f9097]' },
  failed:       { bg: 'bg-[#ffb4ab]/10', text: 'text-[#ffb4ab]' },
  cancelled:    { bg: 'bg-[#8f9097]/10', text: 'text-[#8f9097]' },
  degraded:     { bg: 'bg-[#ffb95f]/10', text: 'text-[#ffb95f]' },
  stale:        { bg: 'bg-[#ffb95f]/10', text: 'text-[#ffb95f]' },
  contradicted: { bg: 'bg-[#ffb4ab]/10', text: 'text-[#ffb4ab]' },
  source_unavailable: { bg: 'bg-[#ffb4ab]/10', text: 'text-[#ffb4ab]' },
  manual:       { bg: 'bg-[#c5c6cd]/10', text: 'text-[#c5c6cd]' },
}

const fallback = { bg: 'bg-[#c5c6cd]/10', text: 'text-[#c5c6cd]' }

export default function StatusBadge({ status }: { status: string }) {
  const s = styles[status] ?? fallback
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[11px] font-semibold tracking-wide ${s.bg} ${s.text}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}
