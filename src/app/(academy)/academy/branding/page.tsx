import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { BannerManager } from "./banner-manager"
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

export default async function BrandingPage() {
  const session = await auth()
  if (!session?.user) return null

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) {
    return (
      <div className="container py-12 max-w-3xl">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No academy for this account.
          </CardContent>
        </Card>
      </div>
    )
  }

  const banners = await prisma.banner.findMany({
    where: { academyId },
    orderBy: { position: "asc" },
  })

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Advertising banners</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Up to 10 rotating banners shown on the landing page and catalogue
          (spec §4.1). Banners auto-rotate for visitors.
        </p>
      </div>
      <BannerManager
        initialBanners={JSON.parse(JSON.stringify(banners))}
      />
    </div>
  )
}
