import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Award, BookOpen, Gift, Layers, Receipt } from "lucide-react"

function daysUntil(future: Date): number {
  return Math.round((future.getTime() - Date.now()) / 86_400_000)
}

export default async function LearnerDashboardPage() {
  const session = await auth()
  if (!session?.user) return null

  const userId = session.user.id

  const [activeGrants, courseCount, programmeCount, certCount, recentCerts, complimentary] =
    await Promise.all([
      prisma.accessGrant.findMany({
        where: { userId, isActive: true, expiresAt: { gt: new Date() } },
        orderBy: { expiresAt: "asc" },
        take: 3,
        select: {
          id: true,
          productType: true,
          expiresAt: true,
          course: { select: { id: true, title: true, slug: true, thumbnail: true } },
          programme: { select: { id: true, title: true, slug: true, thumbnail: true } },
        },
      }),
      prisma.accessGrant.count({
        where: { userId, productType: "COURSE", isActive: true, expiresAt: { gt: new Date() } },
      }),
      prisma.accessGrant.count({
        where: { userId, productType: "PROGRAMME", isActive: true, expiresAt: { gt: new Date() } },
      }),
      prisma.certificate.count({ where: { userId, revokedAt: null } }),
      prisma.certificate.findMany({
        where: { userId, revokedAt: null },
        orderBy: { issuedAt: "desc" },
        take: 3,
        select: {
          id: true,
          certificateId: true,
          courseName: true,
          issuedAt: true,
        },
      }),
      prisma.accessGrant.findFirst({
        where: { userId, productType: "COMPLIMENTARY", isActive: true },
        select: { programme: { select: { title: true, slug: true } } },
      }),
    ])

  const greeting = session.user.name?.split(" ")[0] ?? "there"

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back, {greeting}</h1>
        <p className="text-muted-foreground mt-1">
          Pick up where you left off, or start something new.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={BookOpen} label="Active courses" value={courseCount} href="/my-courses" />
        <StatCard icon={Layers} label="Active programmes" value={programmeCount} href="/learner/programmes" />
        <StatCard icon={Award} label="Certificates" value={certCount} href="/certificates" />
        <StatCard icon={Receipt} label="Invoices" value="View" href="/account/purchases" />
      </div>

      {complimentary?.programme && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="p-5 flex items-start gap-4">
            <Gift className="h-10 w-10 text-amber-600" />
            <div className="flex-1">
              <h3 className="font-semibold">{complimentary.programme.title}</h3>
              <p className="text-sm text-muted-foreground">
                Complimentary content is free for every registered learner.
                No expiry, no certificate required.
              </p>
            </div>
            <Button asChild>
              <Link href="/learner/complimentary">Explore</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expiring soon</CardTitle>
          </CardHeader>
          <CardContent>
            {activeGrants.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Nothing active right now.{" "}
                <Link href="/courses" className="underline">Browse courses</Link>
              </div>
            ) : (
              <ul className="space-y-3">
                {activeGrants.map((g) => {
                  const name = g.course?.title ?? g.programme?.title ?? "Unknown"
                  const href = g.course
                    ? `/my-courses/${g.course.id}`
                    : `/learner/programmes`
                  const days = daysUntil(g.expiresAt)
                  return (
                    <li key={g.id} className="flex items-center justify-between gap-2">
                      <Link href={href} className="text-sm hover:underline truncate">
                        {name}
                      </Link>
                      <Badge variant={days <= 14 ? "destructive" : "outline"}>
                        {days}d left
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent certificates</CardTitle>
          </CardHeader>
          <CardContent>
            {recentCerts.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No certificates yet. Complete a course to earn your first.
              </div>
            ) : (
              <ul className="space-y-3">
                {recentCerts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/verify/${c.certificateId}`}
                        className="text-sm font-medium hover:underline truncate block"
                      >
                        {c.courseName}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.issuedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/api/certificates/${c.id}/download`}>Open</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  href: string
}) {
  return (
    <Link href={href}>
      <Card className="hover:bg-accent/40 transition-colors">
        <CardContent className="p-5 flex items-center gap-3">
          <Icon className="h-8 w-8 text-primary" />
          <div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
