interface PageHeaderProps {
  /** Ledger entry number, e.g. "01" */
  no: string
  title: string
  description?: string
  /** Action buttons rendered on the right */
  actions?: React.ReactNode
}

/**
 * Consistent ledger-style page header: entry numeral, serif title,
 * double hairline rule underneath.
 */
export default function PageHeader({ no, title, description, actions }: PageHeaderProps) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="ledger-no">Entry № {no}</p>
          <h1 className="mt-1 font-headline text-[1.75rem] font-semibold leading-tight text-ledger-on-surface">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-ledger-on-surface-variant">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 pb-1">{actions}</div>}
      </div>
      <div className="ledger-rule mt-4 mb-1" />
    </div>
  )
}
