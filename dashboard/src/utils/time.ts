import { formatDistanceToNowStrict, format, differenceInDays } from 'date-fns'

/**
 * Returns a human-readable relative time string.
 * - Under 7 days: "2m ago", "3h ago", "5d ago"
 * - Over 7 days: "Mar 15"
 */
export function formatRelative(dateStr: string): string {
  const date = new Date(dateStr)
  const days = differenceInDays(new Date(), date)

  if (days > 7) {
    return format(date, 'MMM d')
  }

  return formatDistanceToNowStrict(date, { addSuffix: true })
    .replace(/ seconds?/, 's')
    .replace(/ minutes?/, 'm')
    .replace(/ hours?/, 'h')
    .replace(/ days?/, 'd')
    .replace(/ months?/, 'mo')
    .replace(/ years?/, 'y')
}

/**
 * Returns a formatted timestamp string like "Mar 15, 2:30 PM".
 */
export function formatTimestamp(dateStr: string): string {
  return format(new Date(dateStr), 'MMM d, h:mm a')
}

/**
 * Converts an underscore-separated string to title case.
 * e.g. "source_linked" -> "Source Linked"
 */
export function titleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
