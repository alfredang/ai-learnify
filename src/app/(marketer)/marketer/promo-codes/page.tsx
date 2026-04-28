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
import { Megaphone } from "lucide-react"

/**
 * Promo codes assigned to this marketer. Codes are created by the Academy
 * Admin in /academy/marketers — this page is read-only.
 */
export default async function MarketerPromoCodesPage() {
  const session = await auth()
  if (!session?.user) return null

  const codes = await prisma.promoCode.findMany({
    where: { marketerUserId: session.user.id },
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
  })

  const now = new Date()
  const isWithinWindow = (from: Date | null, to: Date | null) => {
    if (from && now < from) return false
    if (to && now > to) return false
    return true
  }

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Promo Codes</h1>
        <p className="text-muted-foreground mt-1">
          Codes assigned to you. Share them with your audience — every
          checkout that uses one credits a commission to your account.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4" /> Your codes
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
                <TableHead>Valid</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    No promo codes assigned yet. An Academy Admin creates
                    codes and assigns you as the marketer.
                  </TableCell>
                </TableRow>
              ) : (
                codes.map((c) => {
                  const inWindow = isWithinWindow(c.validFrom, c.validTo)
                  const exhausted =
                    c.usageLimit != null && c.usageCount >= c.usageLimit
                  const live = c.isActive && inWindow && !exhausted
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">
                        {c.code}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.academy.name}
                      </TableCell>
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
                      <TableCell className="text-xs text-muted-foreground">
                        {c.validFrom
                          ? new Date(c.validFrom).toLocaleDateString()
                          : "—"}{" "}
                        →{" "}
                        {c.validTo
                          ? new Date(c.validTo).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {live ? (
                          <Badge variant="default">Live</Badge>
                        ) : exhausted ? (
                          <Badge variant="destructive">Used up</Badge>
                        ) : !inWindow ? (
                          <Badge variant="outline">Out of window</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
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
    </div>
  )
}
