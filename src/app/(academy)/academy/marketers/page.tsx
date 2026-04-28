import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PromoCodeManager } from "./promo-code-manager"
import { CampaignPerformance } from "./campaign-performance"
import { Card, CardContent } from "@/components/ui/card"

async function resolveAcademyId(userId: string, platformRole: string) {
  if (platformRole === "PLATFORM_OWNER") {
    const a = await prisma.academy.findFirst({ where: { isActive: true }, select: { id: true } })
    return a?.id ?? null
  }
  const m = await prisma.academyMembership.findFirst({
    where: { userId, role: "ACADEMY_ADMIN" },
    select: { academyId: true },
  })
  return m?.academyId ?? null
}

export default async function MarketersPage() {
  const session = await auth()
  if (!session?.user) return null

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) {
    return (
      <div className="container py-12">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No academy membership found.
          </CardContent>
        </Card>
      </div>
    )
  }

  const [codes, marketers, academy, ledgerByType, marketerLegs, discountLegs, perCodeLegs] =
    await Promise.all([
      prisma.promoCode.findMany({
        where: { academyId },
        orderBy: { createdAt: "desc" },
        include: {
          marketer: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.academyMembership.findMany({
        where: { academyId, role: { in: ["MARKETER", "ACADEMY_ADMIN"] } },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.academy.findUnique({
        where: { id: academyId },
        select: { primaryCurrency: true },
      }),
      // Spec §16 — campaign perf: aggregate MARKETER + DISCOUNT legs over the
      // whole academy. Refunds counter-balance via REFUND_MARKETER /
      // REFUND_DISCOUNT so the sums are always net.
      prisma.ledgerEntry.groupBy({
        by: ["entryType"],
        where: {
          academyId,
          entryType: { in: ["MARKETER", "DISCOUNT", "REFUND_MARKETER", "REFUND_DISCOUNT"] },
        },
        _sum: { amountMinor: true },
      }),
      // Per-marketer commission: group MARKETER + REFUND_MARKETER legs by
      // beneficiaryUserId to show who earned what across all of their codes.
      prisma.ledgerEntry.groupBy({
        by: ["beneficiaryUserId"],
        where: {
          academyId,
          entryType: { in: ["MARKETER", "REFUND_MARKETER"] },
          beneficiaryUserId: { not: null },
        },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
      prisma.ledgerEntry.count({
        where: { academyId, entryType: "DISCOUNT" },
      }),
      // Spec §15 — per-code attribution. Each leg of a checkout that used a
      // promo code carries promoCodeId; aggregate by (code, type) for
      // gross/discount/commission lines per code.
      prisma.ledgerEntry.groupBy({
        by: ["promoCodeId", "entryType"],
        where: {
          academyId,
          promoCodeId: { not: null },
          entryType: {
            in: [
              "CHARGE",
              "DISCOUNT",
              "MARKETER",
              "REFUND_CHARGE",
              "REFUND_DISCOUNT",
              "REFUND_MARKETER",
            ],
          },
        },
        _sum: { amountMinor: true },
      }),
    ])

  const totalUsage = codes.reduce((a, c) => a + c.usageCount, 0)
  const activeCodes = codes.filter((c) => c.isActive).length

  const ledgerSum = (type: string) => {
    const row = ledgerByType.find((r) => r.entryType === type)
    return Number(row?._sum.amountMinor ?? 0)
  }
  // MARKETER legs are negative (money leaving the academy → marketer).
  // Negate to show the dollar amount paid out.
  const totalCommissionMinor = -(ledgerSum("MARKETER") + ledgerSum("REFUND_MARKETER"))
  const totalDiscountMinor = -(ledgerSum("DISCOUNT") + ledgerSum("REFUND_DISCOUNT"))

  // Build per-marketer rows joining the academy membership list with their
  // legs, so even marketers with no earnings appear (with 0).
  const legByUser = new Map(
    marketerLegs.map((l) => [
      l.beneficiaryUserId!,
      { sumMinor: -Number(l._sum.amountMinor ?? 0), legCount: l._count._all },
    ])
  )
  const codesByUser = new Map<string, { count: number; usage: number }>()
  for (const c of codes) {
    if (!c.marketerUserId) continue
    const prev = codesByUser.get(c.marketerUserId) ?? { count: 0, usage: 0 }
    codesByUser.set(c.marketerUserId, {
      count: prev.count + 1,
      usage: prev.usage + c.usageCount,
    })
  }

  const marketerRows = marketers
    .filter((m) => codesByUser.has(m.user.id))
    .map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      codeCount: codesByUser.get(m.user.id)?.count ?? 0,
      usage: codesByUser.get(m.user.id)?.usage ?? 0,
      commissionMinor: legByUser.get(m.user.id)?.sumMinor ?? 0,
    }))
    .sort((a, b) => b.commissionMinor - a.commissionMinor)

  // Build per-code totals from the (promoCodeId, entryType) groupBy. Sums
  // here are signed: CHARGE positive, DISCOUNT/MARKETER negative; refund
  // legs the opposite. We negate the cost legs so the UI shows positive
  // amounts.
  type PerCodeBucket = { grossMinor: number; discountMinor: number; commissionMinor: number }
  const perCode = new Map<string, PerCodeBucket>()
  for (const leg of perCodeLegs) {
    if (!leg.promoCodeId) continue
    const bucket = perCode.get(leg.promoCodeId) ?? {
      grossMinor: 0,
      discountMinor: 0,
      commissionMinor: 0,
    }
    const amount = Number(leg._sum.amountMinor ?? 0)
    if (leg.entryType === "CHARGE") bucket.grossMinor += amount
    else if (leg.entryType === "REFUND_CHARGE") bucket.grossMinor += amount
    else if (leg.entryType === "DISCOUNT") bucket.discountMinor += -amount
    else if (leg.entryType === "REFUND_DISCOUNT") bucket.discountMinor += -amount
    else if (leg.entryType === "MARKETER") bucket.commissionMinor += -amount
    else if (leg.entryType === "REFUND_MARKETER") bucket.commissionMinor += -amount
    perCode.set(leg.promoCodeId, bucket)
  }

  const codeRows = codes
    .map((c) => {
      const b = perCode.get(c.id) ?? { grossMinor: 0, discountMinor: 0, commissionMinor: 0 }
      return {
        id: c.id,
        code: c.code,
        marketer: c.marketer
          ? { name: c.marketer.name, email: c.marketer.email }
          : null,
        usageCount: c.usageCount,
        grossMinor: b.grossMinor,
        discountMinor: b.discountMinor,
        commissionMinor: b.commissionMinor,
      }
    })
    .sort((a, b) => b.grossMinor - a.grossMinor)

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Marketing & promo codes</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Spec §15 step 1 + §6 step 4. Each code carries a marketer commission
          and/or a learner discount, both in basis points (100 bps = 1%).
        </p>
      </div>

      <CampaignPerformance
        currency={academy?.primaryCurrency ?? "USD"}
        totalCodes={codes.length}
        activeCodes={activeCodes}
        totalUsage={totalUsage}
        discountedTransactions={discountLegs}
        totalCommissionMinor={totalCommissionMinor}
        totalDiscountMinor={totalDiscountMinor}
        marketerRows={marketerRows}
        codeRows={codeRows}
      />

      <PromoCodeManager
        initialCodes={JSON.parse(JSON.stringify(codes))}
        marketers={JSON.parse(JSON.stringify(marketers.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
        }))))}
      />
    </div>
  )
}
