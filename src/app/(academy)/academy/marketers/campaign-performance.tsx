import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tag, TrendingUp, Ticket, Users } from "lucide-react"

type MarketerRow = {
  userId: string
  name: string | null
  email: string
  codeCount: number
  usage: number
  commissionMinor: number
}

type CodeRow = {
  id: string
  code: string
  marketer: { name: string | null; email: string } | null
  usageCount: number
  grossMinor: number
  discountMinor: number
  commissionMinor: number
}

interface Props {
  currency: string
  totalCodes: number
  activeCodes: number
  totalUsage: number
  discountedTransactions: number
  totalCommissionMinor: number
  totalDiscountMinor: number
  marketerRows: MarketerRow[]
  codeRows: CodeRow[]
}

function formatMinor(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(minor / 100)
}

export function CampaignPerformance({
  currency,
  totalCodes,
  activeCodes,
  totalUsage,
  discountedTransactions,
  totalCommissionMinor,
  totalDiscountMinor,
  marketerRows,
  codeRows,
}: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Campaign performance</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Net of refunds. Sourced from the immutable ledger (spec §16).
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          icon={Ticket}
          label="Promo codes"
          value={String(totalCodes)}
          hint={`${activeCodes} active`}
        />
        <Stat
          icon={Users}
          label="Conversions"
          value={String(totalUsage)}
          hint={`${discountedTransactions} discounted txns`}
        />
        <Stat
          icon={Tag}
          label="Discounts given"
          value={formatMinor(totalDiscountMinor, currency)}
          hint="Total off learner price"
        />
        <Stat
          icon={TrendingUp}
          label="Marketer commission"
          value={formatMinor(totalCommissionMinor, currency)}
          hint="Earned by marketers (net)"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">By promo code</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Marketer</TableHead>
                <TableHead className="text-right">Uses</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Commission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codeRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    No promo codes yet.
                  </TableCell>
                </TableRow>
              ) : (
                codeRows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                    <TableCell className="text-xs">
                      {c.marketer
                        ? c.marketer.name ?? c.marketer.email
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {c.usageCount}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMinor(c.grossMinor, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatMinor(c.discountMinor, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMinor(c.commissionMinor, currency)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">By marketer</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marketer</TableHead>
                <TableHead className="text-right">Codes</TableHead>
                <TableHead className="text-right">Conversions</TableHead>
                <TableHead className="text-right">Commission earned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {marketerRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    No promo codes assigned to a marketer yet.
                  </TableCell>
                </TableRow>
              ) : (
                marketerRows.map((m) => (
                  <TableRow key={m.userId}>
                    <TableCell>
                      <div className="text-sm">{m.name ?? m.email}</div>
                      {m.name ? (
                        <div className="text-[11px] text-muted-foreground">
                          {m.email}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right text-sm">{m.codeCount}</TableCell>
                    <TableCell className="text-right text-sm">{m.usage}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMinor(m.commissionMinor, currency)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-3">
        <Icon className="h-7 w-7 text-primary" />
        <div className="min-w-0">
          <div className="text-xl font-bold truncate">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
          {hint && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {hint}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
