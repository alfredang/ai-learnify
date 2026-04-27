import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PromoCodeManager } from "./promo-code-manager"
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

  const [codes, marketers] = await Promise.all([
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
  ])

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Marketing & promo codes</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Spec §15 step 1 + §6 step 4. Each code carries a marketer commission
          and/or a learner discount, both in basis points (100 bps = 1%).
        </p>
      </div>

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
