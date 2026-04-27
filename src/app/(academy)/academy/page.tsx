import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BookOpen, Users, ScrollText, Star, Clock, TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"

async function resolveAcademyId(userId: string, platformRole: string): Promise<string | null> {
  if (platformRole === "PLATFORM_OWNER") {
    const a = await prisma.academy.findFirst({ where: { isActive: true }, select: { id: true } })
    return a?.id ?? null
  }
  const membership = await prisma.academyMembership.findFirst({
    where: { userId, role: "ACADEMY_ADMIN" },
    select: { academyId: true },
  })
  return membership?.academyId ?? null
}

export default async function AcademyDashboardPage() {
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
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">
              No academy membership found for this account.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const [academy, pendingCount, learnerCount, courseCount, avgRatingAgg, recentLearners, perCourseRatings] =
    await Promise.all([
      prisma.academy.findUnique({
        where: { id: academyId },
        select: { id: true, name: true, slug: true, aiEnabled: true, primaryCurrency: true },
      }),
      prisma.course.count({
        where: { academyId, status: "PENDING_REVIEW" },
      }),
      prisma.academyMembership.count({
        where: { academyId, role: "LEARNER" },
      }),
      prisma.course.count({
        where: { academyId, status: "PUBLISHED" },
      }),
      // Average survey star rating across all courses in this academy.
      prisma.surveyResponse.aggregate({
        _avg: { starRating: true },
        _count: { _all: true },
        where: { survey: { course: { academyId } } },
      }),
      prisma.academyMembership.findMany({
        where: { academyId, role: "LEARNER" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          createdAt: true,
          user: { select: { nameToBeCalled: true, name: true, email: true } },
        },
      }),
      // Spec §Learner Step 6: survey satisfaction rating collated and
      // displayed prominently on the academy admin dashboard. One row
      // per course + survey response count + average.
      prisma.$queryRaw<
        Array<{
          courseId: string
          title: string
          avgRating: number | null
          responseCount: bigint
        }>
      >`
        SELECT c."id" AS "courseId",
               c."title" AS "title",
               AVG(sr."starRating")::float AS "avgRating",
               COUNT(sr."id")::bigint AS "responseCount"
          FROM "Course" c
          LEFT JOIN "Survey" s ON s."courseId" = c."id"
          LEFT JOIN "SurveyResponse" sr ON sr."surveyId" = s."id"
         WHERE c."academyId" = ${academyId}
           AND c."status" = 'PUBLISHED'
         GROUP BY c."id", c."title"
        HAVING COUNT(sr."id") > 0
         ORDER BY "avgRating" DESC NULLS LAST
         LIMIT 50
      `,
    ])

  const avgRating = avgRatingAgg._avg.starRating
    ? avgRatingAgg._avg.starRating.toFixed(2)
    : "—"
  const totalResponses = avgRatingAgg._count._all

  const ratingsWithCount = perCourseRatings.map((r) => ({
    courseId: r.courseId,
    title: r.title,
    avgRating: r.avgRating ?? 0,
    responseCount: Number(r.responseCount),
  }))
  const topRated = ratingsWithCount.slice(0, 5)
  const worstRated = [...ratingsWithCount]
    .sort((a, b) => a.avgRating - b.avgRating)
    .slice(0, 5)

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{academy?.name}</h1>
          <p className="text-muted-foreground mt-1">
            Academy administration &middot; currency {academy?.primaryCurrency ?? "USD"}
            {" "}&middot; AI {academy?.aiEnabled ? "enabled" : "disabled"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/academy/branding">Edit banners</Link>
          </Button>
          <Button asChild>
            <Link href="/academy/courses">Review courses</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Clock} label="Awaiting review" value={pendingCount} href="/academy/courses" tone={pendingCount > 0 ? "accent" : undefined} />
        <StatCard icon={BookOpen} label="Published courses" value={courseCount} href="/academy/courses" />
        <StatCard icon={Users} label="Learners" value={learnerCount} href="/academy/learners" />
        <StatCard
          icon={Star}
          label={`Avg survey rating · ${totalResponses} response${totalResponses === 1 ? "" : "s"}`}
          value={`${avgRating} / 5`}
          href="#"
        />
      </div>

      {/* Spec §Learner Step 6 — satisfaction rating collated per course,
          displayed prominently so the admin can make business decisions. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500" /> Course satisfaction
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ratingsWithCount.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No survey responses yet. Ratings appear here once learners
              complete the course survey (spec §7.4).
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
              <RatingList title="Top rated" icon={TrendingUp} rows={topRated} tone="up" />
              <RatingList title="Needs attention" icon={TrendingDown} rows={worstRated} tone="down" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent learners</CardTitle>
          </CardHeader>
          <CardContent>
            {recentLearners.length === 0 ? (
              <div className="text-sm text-muted-foreground">No sign-ups yet.</div>
            ) : (
              <ul className="space-y-2">
                {recentLearners.map((m, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {m.user.nameToBeCalled ?? m.user.name ?? m.user.email}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {m.user.email}
                      </div>
                    </div>
                    <Badge variant="outline">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/academy/learners">View all →</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickLink href="/academy/branding" icon={BookOpen} label="Configure banner carousel" />
            <QuickLink href="/academy/learners" icon={Users} label="Manage learners" />
            <QuickLink href="/academy/courses" icon={BookOpen} label="Approve courses" />
            <QuickLink href="/academy/audit" icon={ScrollText} label="View audit log" />
            <QuickLink href="/academy/settings" icon={ScrollText} label="Academy settings" />
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
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  href: string
  tone?: "accent"
}) {
  return (
    <Link href={href}>
      <Card className={tone === "accent" ? "border-amber-400 bg-amber-50/50" : "hover:bg-accent/40 transition-colors"}>
        <CardContent className="p-5 flex items-center gap-3">
          <Icon className="h-7 w-7 text-primary" />
          <div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-sm"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span>{label}</span>
    </Link>
  )
}

function RatingList({
  title,
  icon: Icon,
  rows,
  tone,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  rows: Array<{ courseId: string; title: string; avgRating: number; responseCount: number }>
  tone: "up" | "down"
}) {
  if (rows.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-sm font-medium mb-2">
          <Icon className="h-4 w-4" /> {title}
        </div>
        <div className="text-xs text-muted-foreground">No data yet.</div>
      </div>
    )
  }
  return (
    <div className="p-4 space-y-2">
      <div
        className={cn(
          "flex items-center gap-2 text-sm font-medium px-2",
          tone === "up" ? "text-green-700" : "text-amber-700"
        )}
      >
        <Icon className="h-4 w-4" /> {title}
      </div>
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.courseId} className="flex items-center justify-between gap-3 py-2 px-2">
            <span className="text-sm truncate flex-1" title={r.title}>
              {r.title}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <StarStrip rating={r.avgRating} />
              <span className="font-mono text-xs w-10 text-right">
                {r.avgRating.toFixed(1)}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                ({r.responseCount})
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StarStrip({ rating }: { rating: number }) {
  // Render 5 stars, filled proportionally. Close enough for a dashboard
  // glance — no fractional fills needed.
  const full = Math.floor(rating + 0.25)
  return (
    <div className="flex items-center">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "h-3.5 w-3.5",
            n <= full
              ? "fill-yellow-400 text-yellow-400"
              : "text-muted-foreground/30"
          )}
        />
      ))}
    </div>
  )
}
