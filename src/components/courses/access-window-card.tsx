import { format } from "date-fns"
import { Card, CardContent } from "@/components/ui/card"
import { Calendar, Mail, Lock, CheckCircle, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

type ProductType = "COURSE" | "PROGRAMME" | "COMPLIMENTARY"

interface AccessWindowCardProps {
  /** When the access grant was issued (purchase / enrolment date). */
  grantedAt: Date | string
  /** When access expires. */
  expiresAt: Date | string
  productType: ProductType
  /** "course" or "programme" — used in copy. */
  productLabel?: string
}

const dayMs = 86_400_000

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d)
}

function fmt(d: Date): string {
  return format(d, "d MMM yyyy")
}

/**
 * Spec §11.1 / §11.2 — show the learner the 90-day window and the
 * automated reminder schedule (M1 end, M2 end, T-14). Used on
 * /my-courses/[courseId] and /my-courses/programmes/[id].
 *
 * Programmes share a single window across all bundled courses, so the
 * caller can pass productLabel="programme" to surface that.
 */
export function AccessWindowCard({
  grantedAt,
  expiresAt,
  productType,
  productLabel = "course",
}: AccessWindowCardProps) {
  const granted = toDate(grantedAt)
  const expires = toDate(expiresAt)
  const now = new Date()

  const isComplimentary = productType === "COMPLIMENTARY"

  if (isComplimentary) {
    return (
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Access</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Complimentary content — access never expires. Reminder emails are
            not sent.
          </p>
        </CardContent>
      </Card>
    )
  }

  const totalMs = expires.getTime() - granted.getTime()
  const elapsedMs = Math.max(0, Math.min(totalMs, now.getTime() - granted.getTime()))
  const pct = totalMs > 0 ? Math.round((elapsedMs / totalMs) * 100) : 0
  const daysLeft = Math.max(0, Math.round((expires.getTime() - now.getTime()) / dayMs))
  const isExpired = expires.getTime() <= now.getTime()

  // Reminders fire at M1 end (~60d before expiry), M2 end (~30d before),
  // and T-14. Compute the actual calendar dates relative to expiry.
  const reminders: Array<{
    label: string
    when: Date
    sub: string
  }> = [
    {
      label: "End of Month 1",
      when: new Date(expires.getTime() - 60 * dayMs),
      sub: "60 days before expiry",
    },
    {
      label: "End of Month 2",
      when: new Date(expires.getTime() - 30 * dayMs),
      sub: "30 days before expiry",
    },
    {
      label: "Two weeks notice",
      when: new Date(expires.getTime() - 14 * dayMs),
      sub: "14 days before expiry",
    },
  ]

  const headlineTone = isExpired
    ? "text-destructive"
    : daysLeft <= 14
      ? "text-amber-700 dark:text-amber-300"
      : "text-foreground"

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Access window</h3>
          </div>
          <span className={cn("text-xs font-medium", headlineTone)}>
            {isExpired
              ? "Expired"
              : daysLeft === 0
                ? "Expires today"
                : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Started {fmt(granted)}</span>
            <span>Ends {fmt(expires)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                isExpired
                  ? "bg-destructive"
                  : daysLeft <= 14
                    ? "bg-amber-500"
                    : "bg-primary"
              )}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            90-day {productLabel} access from purchase
            {productLabel === "programme"
              ? " — shared across every course in this programme"
              : ""}
            .
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              Reminder schedule
            </span>
          </div>
          <ul className="space-y-1.5">
            {reminders.map((r) => {
              const sent = r.when.getTime() <= now.getTime()
              const upcoming = !sent && !isExpired
              return (
                <li
                  key={r.label}
                  className="flex items-center gap-2 text-xs"
                >
                  {sent ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                  ) : isExpired ? (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="font-medium flex-1 truncate">{r.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {fmt(r.when)}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-wide w-12 text-right",
                      sent
                        ? "text-green-600"
                        : upcoming
                          ? "text-amber-600"
                          : "text-muted-foreground"
                    )}
                  >
                    {sent ? "sent" : upcoming ? "upcoming" : "—"}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
