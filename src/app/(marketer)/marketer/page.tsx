import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Users, Ticket, MousePointerClick } from "lucide-react"

/**
 * Marketer performance dashboard.
 *
 * Tracks promo code conversions only. Commission/payout amounts were
 * removed when payments were taken out of scope.
 */

export default async function MarketerDashboardPage() {
  const session = await auth()
  if (!session?.user) return null
  const userId = session.user.id

  const [codes, activeCodes] = await Promise.all([
    prisma.promoCode.findMany({
      where: { marketerUserId: userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        marketerCommissionBps: true,
        learnerDiscountBps: true,
        usageCount: true,
        usageLimit: true,
        isActive: true,
        validFrom: true,
        validTo: true,
        academy: { select: { name: true } },
      },
    }),
    prisma.promoCode.count({
      where: { marketerUserId: userId, isActive: true },
    }),
  ])

  const totalConversions = codes.reduce((a, c) => a + c.usageCount, 0)

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Performance</h1>
        <p className="text-muted-foreground mt-1">
          Spec §5. Campaign metrics tied to your promo codes. No access to
          learner personal data beyond attribution.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat
          icon={Users}
          label="Conversions"
          value={String(totalConversions)}
          hint={`${activeCodes} active code${activeCodes === 1 ? "" : "s"}`}
        />
        <Stat
          icon={Ticket}
          label="Active codes"
          value={String(activeCodes)}
          hint="Promo codes you can share"
        />
        <Stat
          icon={MousePointerClick}
          label="Clicks"
          value="—"
          hint="Not tracked yet"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Ticket className="h-4 w-4" /> Your promo codes
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Academy</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead className="text-right">Uses</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    No promo codes assigned yet. An Academy Admin creates codes
                    and assigns you as the marketer.
                  </TableCell>
                </TableRow>
              ) : (
                codes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">
                      {c.code}
                    </TableCell>
                    <TableCell className="text-xs">{c.academy.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {(c.marketerCommissionBps / 100).toFixed(2)}%
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {(c.learnerDiscountBps / 100).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {c.usageCount}
                      {c.usageLimit != null ? ` / ${c.usageLimit}` : ""}
                    </TableCell>
                    <TableCell>
                      {c.isActive ? (
                        <Badge variant="default">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
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
        <div>
          <div className="text-2xl font-bold">{value}</div>
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
