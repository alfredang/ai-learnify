import { redirect } from "next/navigation"
import Link from "next/link"
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
import { Tag, Users, Building2 } from "lucide-react"

export default async function PlatformPromosPage() {
  const session = await auth()
  if (!session?.user) redirect("/login?callbackUrl=/platform/promos")
  if (session.user.platformRole !== "PLATFORM_OWNER") redirect("/platform/ops")

  const codes = await prisma.promoCode.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      academy: { select: { id: true, name: true, slug: true } },
      marketer: { select: { id: true, name: true, email: true } },
    },
  })

  const totalActive = codes.filter((c) => c.isActive).length
  const totalRedeemed = codes.reduce((sum, c) => sum + c.usageCount, 0)
  const academiesUsing = new Set(codes.map((c) => c.academyId)).size

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Promo codes — cross-academy</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Spec §15 step 3. Read-only oversight of every promo code on the
          platform. Each code carries a Marketer Commission % and a Learner
          Discount %; both are credited / debited as ledger legs at checkout
          and remain auditable forever.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Tag} label="Active codes" value={totalActive} />
        <StatCard icon={Tag} label="Total codes" value={codes.length} />
        <StatCard icon={Users} label="Total redemptions" value={totalRedeemed} />
        <StatCard icon={Building2} label="Academies using promos" value={academiesUsing} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All codes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Academy</TableHead>
                <TableHead>Marketer</TableHead>
                <TableHead className="text-right">Marketer %</TableHead>
                <TableHead className="text-right">Discount %</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">Limit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                    No promo codes have been issued on the platform yet.
                  </TableCell>
                </TableRow>
              ) : (
                codes.map((c) => {
                  const expired = c.validTo
                    ? new Date(c.validTo) < new Date()
                    : false
                  const exhausted =
                    c.usageLimit !== null && c.usageCount >= c.usageLimit
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs font-medium">
                        {c.code}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Link
                          href={`/platform/users?academy=${c.academy.slug}`}
                          className="hover:underline"
                        >
                          {c.academy.name}
                        </Link>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          /{c.academy.slug}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.marketer ? (
                          <>
                            {c.marketer.name ?? c.marketer.email}
                            <div className="text-[10px] text-muted-foreground">
                              {c.marketer.email}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {(c.marketerCommissionBps / 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {(c.learnerDiscountBps / 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {c.usageCount}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {c.usageLimit ?? "∞"}
                      </TableCell>
                      <TableCell>
                        {!c.isActive ? (
                          <Badge variant="secondary">Disabled</Badge>
                        ) : expired ? (
                          <Badge variant="destructive">Expired</Badge>
                        ) : exhausted ? (
                          <Badge variant="destructive">Exhausted</Badge>
                        ) : (
                          <Badge className="bg-green-600 hover:bg-green-600">
                            Active
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="p-5 text-sm text-muted-foreground">
          Promo codes are created and edited per-academy by the Academy Admin.
          The Platform Owner cannot create codes on behalf of an academy from
          this view — only audit and disable a misbehaving code via the
          academy&apos;s own promo manager.
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-3">
        <Icon className="h-7 w-7 text-primary shrink-0" />
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}
