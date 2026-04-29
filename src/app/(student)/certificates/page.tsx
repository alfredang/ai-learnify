import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Award, CheckCircle2, Clock, Download, ExternalLink, FileBadge, RefreshCw, XCircle } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkCertEligibility, type CertEligibility } from "@/lib/certification"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = {
  title: "My Certificates",
  description: "View and download your course completion certificates",
}

type EligibleCourse = {
  courseId: string
  courseTitle: string
  expiresAt: Date
  eligibility: CertEligibility
}

async function loadCertificates(userId: string) {
  return prisma.certificate.findMany({
    where: { userId },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      certificateId: true,
      courseName: true,
      instructorName: true,
      issuedAt: true,
      revokedAt: true,
      revokedReason: true,
      cpdName: true,
      cpdPoints: true,
    },
  })
}

async function loadInProgressCourses(userId: string, issuedCourseIds: Set<string>): Promise<EligibleCourse[]> {
  // Spec §6 — only paid courses qualify. Free courses and complimentary
  // grants are filtered out by the rule engine itself, but we also pre-filter
  // here so the UI doesn't promise certs we'll never issue.
  const grants = await prisma.accessGrant.findMany({
    where: {
      userId,
      productType: "COURSE",
      isActive: true,
      expiresAt: { gt: new Date() },
      source: { not: "COMPLIMENTARY" },
      courseId: { notIn: Array.from(issuedCourseIds) },
    },
    select: {
      courseId: true,
      expiresAt: true,
      course: { select: { id: true, title: true, isFree: true } },
    },
  })

  const candidates = grants.filter((g) => g.course && !g.course.isFree && g.courseId)
  const results = await Promise.all(
    candidates.map(async (g) => {
      const eligibility = await checkCertEligibility(userId, g.courseId!)
      return {
        courseId: g.courseId!,
        courseTitle: g.course!.title,
        expiresAt: g.expiresAt,
        eligibility,
      }
    })
  )
  return results
}

function daysUntil(future: Date): number {
  return Math.ceil((future.getTime() - Date.now()) / 86_400_000)
}

export default async function CertificatesPage() {
  const session = await auth()
  if (!session?.user) {
    redirect("/login?callbackUrl=/certificates")
  }

  const issued = await loadCertificates(session.user.id)
  const issuedCourseIds = new Set(
    (await prisma.certificate.findMany({
      where: { userId: session.user.id, revokedAt: null },
      select: { courseId: true },
    })).map((c) => c.courseId)
  )

  const inProgress = await loadInProgressCourses(session.user.id, issuedCourseIds)

  return (
    <div className="container py-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-2">
        <Award className="h-10 w-10 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">My Certificates</h1>
          <p className="text-muted-foreground">
            Certificates are issued automatically once every requirement is met.
          </p>
        </div>
      </div>

      {issued.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Earned ({issued.length})</h2>
          <div className="space-y-3">
            {issued.map((cert) => {
              const revoked = !!cert.revokedAt
              return (
                <Card key={cert.id} className={revoked ? "border-red-300" : undefined}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="h-14 w-14 shrink-0 bg-primary/10 rounded-lg flex items-center justify-center">
                          <FileBadge className="h-7 w-7 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold truncate">{cert.courseName}</h3>
                            {revoked && <Badge variant="destructive">Revoked</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            Instructor: {cert.instructorName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Issued {new Date(cert.issuedAt).toLocaleDateString()} · ID {cert.certificateId}
                            {cert.cpdName && (
                              <>
                                {" · "}
                                {cert.cpdName}
                                {cert.cpdPoints ? ` (${Number(cert.cpdPoints)} CPD)` : ""}
                              </>
                            )}
                          </p>
                          {revoked && cert.revokedReason && (
                            <p className="mt-1 text-xs text-red-700">
                              Revoked: {cert.revokedReason}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/certificates/${cert.id}`}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View
                          </Link>
                        </Button>
                        {!revoked && (
                          <Button size="sm" asChild>
                            <Link href={`/api/certificates/${cert.id}/download`} target="_blank">
                              <Download className="h-4 w-4 mr-2" />
                              PDF
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {inProgress.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold mb-1">In progress</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Each row shows the gates required for certification. The certificate
            is issued the moment all gates are satisfied — no need to claim.
          </p>
          <div className="space-y-3">
            {inProgress.map((course) => (
              <ProgressCard key={course.courseId} item={course} />
            ))}
          </div>
        </section>
      )}

      {issued.length === 0 && inProgress.length === 0 && (
        <Card className="mt-8">
          <CardContent className="py-12 text-center">
            <Award className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">No certificates yet</h3>
            <p className="text-muted-foreground mb-4">
              Enrol in a paid course and complete it to earn your first certificate.
            </p>
            <Button asChild>
              <Link href="/courses">Browse courses</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ProgressCard({ item }: { item: EligibleCourse }) {
  const { eligibility } = item
  const days = daysUntil(item.expiresAt)
  const expiryWarning = days <= 14
  const allGatesMet = eligibility.eligible

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{item.courseTitle}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Access expires in {days} day{days === 1 ? "" : "s"}
              {expiryWarning && " — finish before it lapses"}
            </p>
          </div>
          {allGatesMet ? (
            <form action="/api/certificates/generate" method="POST">
              <input type="hidden" name="courseId" value={item.courseId} />
              <Button type="submit" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Issue now
              </Button>
            </form>
          ) : (
            <Badge variant="outline" className="shrink-0">
              <Clock className="h-3 w-3 mr-1" />
              Pending
            </Badge>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Gate
            label="Content"
            current={eligibility.contentPct}
            target={eligibility.rule.minContentPct}
            unit="%"
          />
          <Gate
            label="Assessment"
            current={eligibility.assessmentPct ?? 0}
            target={eligibility.rule.minAssessmentPct}
            unit="%"
            unavailable={eligibility.assessmentPct === null ? "No quiz" : undefined}
          />
          <SurveyGate
            done={eligibility.surveyDone}
            required={eligibility.rule.requiresSurvey}
          />
        </div>

        {eligibility.reason === "EXPIRED" && (
          <p className="text-sm text-red-700 flex items-center gap-2">
            <XCircle className="h-4 w-4" /> Access expired — extend or repurchase to qualify.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Gate({
  label,
  current,
  target,
  unit,
  unavailable,
}: {
  label: string
  current: number
  target: number
  unit?: string
  unavailable?: string
}) {
  const met = !unavailable && current >= target
  const pct = unavailable ? 100 : Math.min(100, Math.round((current / Math.max(target, 1)) * 100))
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium">{label}</span>
        <span className={met ? "text-green-700" : "text-muted-foreground"}>
          {unavailable ?? `${current}${unit ?? ""} / ${target}${unit ?? ""}`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={met ? "h-full bg-green-600" : "h-full bg-primary"}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function SurveyGate({ done, required }: { done: boolean; required: boolean }) {
  if (!required) {
    return (
      <div>
        <div className="text-xs font-medium mb-1">Survey</div>
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-green-600" /> Not required
        </div>
      </div>
    )
  }
  return (
    <div>
      <div className="text-xs font-medium mb-1">Survey</div>
      <div className={`text-xs flex items-center gap-1 ${done ? "text-green-700" : "text-muted-foreground"}`}>
        {done ? (
          <>
            <CheckCircle2 className="h-3 w-3" /> Completed
          </>
        ) : (
          <>
            <Clock className="h-3 w-3" /> Pending
          </>
        )}
      </div>
    </div>
  )
}
