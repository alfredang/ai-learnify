import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { ProgrammesManager } from "./programmes-manager"

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

export default async function AcademyProgrammesPage() {
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

  const [academy, programmes, courses] = await Promise.all([
    prisma.academy.findUnique({
      where: { id: academyId },
      select: { primaryCurrency: true },
    }),
    prisma.programme.findMany({
      where: { academyId },
      orderBy: { createdAt: "desc" },
      include: {
        courses: {
          orderBy: { position: "asc" },
          select: {
            position: true,
            course: { select: { id: true, title: true } },
          },
        },
        _count: { select: { accessGrants: true } },
      },
    }),
    prisma.course.findMany({
      where: { academyId, status: { in: ["PUBLISHED", "PENDING_REVIEW", "DRAFT"] } },
      orderBy: { title: "asc" },
      select: { id: true, title: true, status: true },
    }),
  ])

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Programmes</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Spec §6.3 — bundle ≥2 courses behind one price and one shared access
          window. Set the package price and approve before publishing.
        </p>
      </div>

      <ProgrammesManager
        defaultCurrency={academy?.primaryCurrency ?? "USD"}
        initialProgrammes={JSON.parse(
          JSON.stringify(
            programmes.map((p) => ({
              id: p.id,
              title: p.title,
              slug: p.slug,
              subtitle: p.subtitle,
              price: Number(p.price),
              currency: p.currency,
              isFree: p.isFree,
              status: p.status,
              accessDurationDays: p.accessDurationDays,
              publishedAt: p.publishedAt,
              accessGrantCount: p._count.accessGrants,
              courses: p.courses.map((pc) => ({
                id: pc.course.id,
                title: pc.course.title,
              })),
            }))
          )
        )}
        courses={JSON.parse(JSON.stringify(courses))}
      />
    </div>
  )
}
