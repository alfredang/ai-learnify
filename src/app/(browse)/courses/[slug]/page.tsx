import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { StarRating } from "@/components/shared/star-rating"
import { MobileBottomBar } from "@/components/courses/mobile-bottom-bar"
import { FavouriteButton } from "@/components/courses/favourite-button"
import { EnrolCta } from "@/components/courses/enrol-cta"
import { CoursePreview } from "@/components/courses/course-preview"
import { CourseReviewsSection } from "@/components/courses/course-reviews-section"
import { formatPrice } from "@/lib/stripe"
import { ITEMS_PER_PAGE } from "@/lib/constants"
import {
  accessLabel,
  formatClock,
  formatLevel,
  formatTotalLength,
  LECTURE_TYPE_LABEL,
  plural,
} from "@/lib/course-format"
import {
  Play,
  Clock,
  Users,
  BarChart,
  Globe,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Video,
  HelpCircle,
  Smartphone,
  CalendarClock,
  Eye,
  Layers,
  Lock,
  BadgeCheck,
} from "lucide-react"

interface CoursePageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ canceled?: string }>
}

const courseInclude = {
  instructor: {
    select: {
      id: true,
      name: true,
      image: true,
      headline: true,
      bio: true,
      _count: {
        select: {
          courses: { where: { status: "PUBLISHED" as const } },
        },
      },
    },
  },
  category: true,
  cpdCatalog: {
    select: { id: true, name: true, points: true, badgeUrl: true },
  },
  sections: {
    orderBy: { position: "asc" as const },
    include: {
      lectures: {
        orderBy: { position: "asc" as const },
      },
    },
  },
  _count: {
    select: {
      enrollments: true,
      reviews: { where: { isApproved: true } },
    },
  },
}

async function getCourse(slug: string, userId?: string) {
  try {
    // Published course (public access)
    let course = await prisma.course.findUnique({
      where: { slug, status: "PUBLISHED" },
      include: courseInclude,
    })
    // Not published: allow the course owner to preview
    if (!course && userId) {
      course = await prisma.course.findUnique({
        where: { slug, instructorId: userId },
        include: courseInclude,
      })
    }
    return course
  } catch (error) {
    console.error("Failed to fetch course:", error)
    return null
  }
}

async function getEnrollment(courseId: string, userId?: string) {
  if (!userId) return null
  try {
    return await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { progress: true },
    })
  } catch {
    return null
  }
}

async function getCompletedLectureIds(courseId: string, userId?: string) {
  if (!userId) return new Set<string>()
  try {
    const rows = await prisma.lectureProgress.findMany({
      where: { userId, isCompleted: true, lecture: { section: { courseId } } },
      select: { lectureId: true },
    })
    return new Set(rows.map((r) => r.lectureId))
  } catch {
    return new Set<string>()
  }
}

async function checkFavourite(courseId: string, userId?: string) {
  if (!userId) return false
  try {
    const item = await prisma.wishlist.findUnique({
      where: { userId_courseId: { userId, courseId } },
    })
    return !!item
  } catch {
    return false
  }
}

/**
 * Spec §7.4 — when the survey author opts in (showRatingPublicly=true),
 * surface the aggregated learner survey rating on the public page.
 */
async function getPublicSurveyRating(courseId: string) {
  const survey = await prisma.survey.findUnique({
    where: { courseId },
    select: { id: true, isActive: true, showRatingPublicly: true },
  })
  if (!survey || !survey.isActive || !survey.showRatingPublicly) return null
  const agg = await prisma.surveyResponse.aggregate({
    where: { surveyId: survey.id },
    _avg: { starRating: true },
    _count: { _all: true },
  })
  if (!agg._count._all) return null
  return {
    averageStars: Number(agg._avg.starRating ?? 0),
    responseCount: agg._count._all,
  }
}

async function getCourseReviews(courseId: string) {
  const [reviews, distribution, total] = await Promise.all([
    prisma.review.findMany({
      where: { courseId, isApproved: true },
      take: ITEMS_PER_PAGE,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, image: true } } },
    }),
    prisma.review.groupBy({
      by: ["rating"],
      where: { courseId, isApproved: true },
      _count: true,
    }),
    prisma.review.count({ where: { courseId, isApproved: true } }),
  ])
  const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const item of distribution) ratingDistribution[item.rating] = item._count
  return {
    reviews,
    total,
    totalPages: Math.ceil(total / ITEMS_PER_PAGE),
    ratingDistribution,
  }
}

async function getUserReview(courseId: string, userId?: string) {
  if (!userId) return null
  try {
    return await prisma.review.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { id: true, rating: true, comment: true },
    })
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const { slug } = await params
  const session = await auth()
  const course = await getCourse(slug, session?.user?.id)
  if (!course) return { title: "Course Not Found" }
  return {
    title: course.title,
    description: course.subtitle || course.description?.replace(/<[^>]*>/g, "").slice(0, 160),
    openGraph: course.thumbnail ? { images: [course.thumbnail] } : undefined,
  }
}

const lectureIcon: Record<string, typeof Play> = {
  VIDEO: Play,
  QUIZ: HelpCircle,
}

export default async function CoursePage({ params, searchParams }: CoursePageProps) {
  const [{ slug }, { canceled }] = await Promise.all([params, searchParams])
  const session = await auth()
  const course = await getCourse(slug, session?.user?.id)
  if (!course) notFound()

  const userId = session?.user?.id
  const isOwnerPreview = course.status !== "PUBLISHED" && course.instructorId === userId
  const isOwner = userId === course.instructorId

  const [enrollment, completedIds, isFavourited, reviewData, userReview, publicSurveyRating] =
    await Promise.all([
      getEnrollment(course.id, userId),
      getCompletedLectureIds(course.id, userId),
      checkFavourite(course.id, userId),
      getCourseReviews(course.id),
      getUserReview(course.id, userId),
      getPublicSurveyRating(course.id),
    ])
  const isEnrolled = !!enrollment

  const rating = Number(course.averageRating)
  const allLectures = course.sections.flatMap((s) => s.lectures)
  const totalLectures = allLectures.length
  const totalDuration = allLectures.reduce((acc, l) => acc + (l.videoDuration || 0), 0)
  const videoCount = allLectures.filter((l) => l.type === "VIDEO").length
  const quizCount = allLectures.filter((l) => l.type === "QUIZ").length
  const durationText = formatTotalLength(totalDuration)

  // Where "Start / Continue" should land: next incomplete lecture, else the first.
  const nextLecture = allLectures.find((l) => !completedIds.has(l.id)) ?? allLectures[0] ?? null
  const startHref = nextLecture ? `/my-courses/${course.id}/lectures/${nextLecture.id}` : null
  const hasProgress = completedIds.size > 0

  // Public preview: course trailer, else the first free-preview video lecture.
  const previewLecture = allLectures.find((l) => l.isFreePreview && l.type === "VIDEO" && l.videoUrl)
  const previewSrc = course.previewVideoUrl || previewLecture?.videoUrl || null

  // Spec §4.4 — Fee or Complimentary
  const listPrice = Number(course.price)
  const effectivePrice = course.discountPrice ? Number(course.discountPrice) : listPrice
  const isFreeCourse = course.isFree || effectivePrice === 0
  const priceLabel = isFreeCourse ? "Complimentary" : formatPrice(effectivePrice)

  // Keep long curricula scannable: open everything when short, else the
  // first section (or the one containing the learner's next lecture).
  const openAll = totalLectures <= 24
  const nextSectionId = nextLecture?.sectionId

  const updated = course.updatedAt.toLocaleDateString("en-GB", { month: "long", year: "numeric" })

  const includes = [
    videoCount > 0 && { icon: Video, text: `${durationText} of on-demand video` },
    { icon: FileText, text: plural(totalLectures, "lecture") },
    quizCount > 0 && { icon: HelpCircle, text: `${plural(quizCount, "auto-graded quiz", "auto-graded quizzes")}` },
    { icon: CalendarClock, text: accessLabel(course.accessDurationDays) },
    { icon: Smartphone, text: "Learn on mobile, tablet and desktop" },
    { icon: Award, text: "Verifiable certificate of completion" },
    course.cpdCatalog && {
      icon: BadgeCheck,
      text: `${Number(course.cpdCatalog.points)} CPD points`,
    },
  ].filter(Boolean) as { icon: typeof Play; text: string }[]

  const purchasePanel = (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        {isEnrolled ? (
          <Badge variant="secondary" className="text-sm px-3 py-1">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Enrolled · {enrollment.progress}% complete
          </Badge>
        ) : isFreeCourse ? (
          <Badge className="text-sm px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-50">
            Complimentary
          </Badge>
        ) : (
          <>
            <span className="text-3xl font-bold">{formatPrice(effectivePrice)}</span>
            {course.discountPrice && listPrice > effectivePrice && (
              <span className="text-sm text-muted-foreground line-through">{formatPrice(listPrice)}</span>
            )}
          </>
        )}
      </div>

      <EnrolCta
        courseId={course.id}
        courseSlug={slug}
        isFree={isFreeCourse}
        isEnrolled={isEnrolled}
        startHref={startHref}
        hasProgress={hasProgress}
      />

      {isEnrolled && nextLecture && (
        <p className="text-xs text-muted-foreground line-clamp-2">
          {hasProgress ? "Up next: " : "First lecture: "}
          <span className="text-foreground">{nextLecture.title}</span>
        </p>
      )}

      {!isEnrolled && (
        <FavouriteButton courseId={course.id} initialFavourited={isFavourited} variant="full" />
      )}

      <Separator />

      <div className="space-y-2.5 text-sm">
        <h3 className="font-semibold">This course includes</h3>
        <ul className="space-y-2">
          {includes.map((item) => (
            <li key={item.text} className="flex items-start gap-2.5">
              <item.icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden="true" />
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )

  const navItems = [
    { href: "#overview", label: "Overview" },
    { href: "#curriculum", label: "Curriculum" },
    { href: "#instructor", label: "Instructor" },
    { href: "#reviews", label: "Reviews" },
  ]

  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      {isOwner && (
        <div className="border-b border-blue-200 bg-blue-50">
          <div className="container py-2.5 flex flex-wrap items-center justify-center gap-2 text-sm text-blue-800">
            <Eye className="h-4 w-4" />
            <span>
              {isOwnerPreview ? (
                <>
                  You are previewing this course. It is currently{" "}
                  <strong>{course.status.replace("_", " ").toLowerCase()}</strong> and not visible to learners.
                </>
              ) : (
                <>You are the instructor of this course — viewing the public page.</>
              )}
            </span>
            <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
              <Link href={`/instructor/courses/${course.id}`}>
                {isOwnerPreview ? "Back to editor" : "Edit course"}
              </Link>
            </Button>
          </div>
        </div>
      )}

      {canceled === "true" && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="container py-2.5 text-center text-sm text-amber-800">
            Payment was cancelled. You can try again whenever you&apos;re ready.
          </div>
        </div>
      )}

      <div className="container py-5 md:py-8">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
          {/* ───────────── Main column ───────────── */}
          <div className="min-w-0">
            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="mb-4">
              <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <li>
                  <Link href="/" className="hover:text-foreground">Home</Link>
                </li>
                <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
                <li>
                  <Link href="/courses" className="hover:text-foreground">Courses</Link>
                </li>
                <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
                <li>
                  <Link href={`/categories/${course.category.slug}`} className="hover:text-foreground">
                    {course.category.name}
                  </Link>
                </li>
              </ol>
            </nav>

            {/* Header */}
            <header className="space-y-4">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{course.title}</h1>
              {course.subtitle && (
                <p className="text-lg text-muted-foreground max-w-3xl">{course.subtitle}</p>
              )}

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                {course._count.reviews > 0 ? (
                  <a href="#reviews" className="flex items-center gap-1.5 hover:underline">
                    <span className="font-semibold">{rating.toFixed(1)}</span>
                    <StarRating rating={rating} size="sm" />
                    <span className="text-muted-foreground">({plural(course._count.reviews, "review")})</span>
                  </a>
                ) : (
                  <Badge variant="outline" className="font-medium">New course</Badge>
                )}
                {publicSurveyRating && (
                  <span className="flex items-center gap-1.5" title="Average rating from the post-course survey">
                    <span className="font-semibold">{publicSurveyRating.averageStars.toFixed(1)}</span>
                    <StarRating rating={publicSurveyRating.averageStars} size="sm" />
                    <span className="text-muted-foreground">
                      ({plural(publicSurveyRating.responseCount, "learner survey")})
                    </span>
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {plural(course._count.enrollments, "learner")}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={course.instructor.image || ""} alt="" />
                  <AvatarFallback>{course.instructor.name?.[0] || "I"}</AvatarFallback>
                </Avatar>
                <p className="text-sm">
                  <span className="text-muted-foreground">Created by </span>
                  <a href="#instructor" className="font-medium hover:underline">{course.instructor.name}</a>
                  {course.partnerName && (
                    <>
                      <span className="text-muted-foreground"> in partnership with </span>
                      <span className="font-medium">{course.partnerName}</span>
                    </>
                  )}
                </p>
              </div>

              <ul className="flex flex-wrap gap-2 text-xs">
                {[
                  { icon: BarChart, text: formatLevel(course.level) },
                  { icon: Clock, text: `${durationText} total` },
                  { icon: Layers, text: plural(totalLectures, "lecture") },
                  { icon: Globe, text: course.language },
                  { icon: CalendarClock, text: `Updated ${updated}` },
                  ...(course.cpdCatalog
                    ? [{ icon: BadgeCheck, text: `${Number(course.cpdCatalog.points)} CPD points` }]
                    : []),
                ].map((m) => (
                  <li key={m.text} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-muted-foreground">
                    <m.icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {m.text}
                  </li>
                ))}
              </ul>
            </header>

            {/* Mobile / tablet purchase block */}
            <div className="mt-6 lg:hidden space-y-4">
              <CoursePreview
                title={course.title}
                thumbnail={course.thumbnail}
                previewSrc={previewSrc}
                startHref={isEnrolled ? startHref : null}
              />
              <Card>
                <CardContent className="p-5">{purchasePanel}</CardContent>
              </Card>
            </div>

            {/* Sticky in-page navigation */}
            <nav
              aria-label="Course sections"
              className="sticky top-16 z-30 -mx-4 mt-8 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:px-0"
            >
              <ul className="flex gap-6 overflow-x-auto text-sm font-medium [scrollbar-width:none]">
                {navItems.map((n) => (
                  <li key={n.href}>
                    <a
                      href={n.href}
                      className="block whitespace-nowrap border-b-2 border-transparent py-3 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                    >
                      {n.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="space-y-10 pt-8">
              {/* Overview */}
              <section id="overview" className="scroll-mt-32 space-y-8">
                {course.learningOutcomes.length > 0 && (
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold mb-4">What you&apos;ll learn</h2>
                    <div className="rounded-lg border p-5">
                      <ul className="grid gap-3 md:grid-cols-2">
                        {course.learningOutcomes.map((outcome, index) => (
                          <li key={index} className="flex gap-2.5 text-sm leading-relaxed">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" aria-hidden="true" />
                            <span>{outcome}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {course.description && (
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold mb-3">About this course</h2>
                    <div
                      className="prose prose-neutral max-w-none text-[15px] leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: course.description }}
                    />
                  </div>
                )}

                {(course.requirements.length > 0 || course.targetAudience.length > 0) && (
                  <div className="grid gap-6 md:grid-cols-2">
                    {course.requirements.length > 0 && (
                      <div>
                        <h2 className="text-lg font-bold mb-3">Requirements</h2>
                        <ul className="space-y-2 text-sm">
                          {course.requirements.map((req, index) => (
                            <li key={index} className="flex gap-2">
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
                              <span>{req}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {course.targetAudience.length > 0 && (
                      <div>
                        <h2 className="text-lg font-bold mb-3">Who this course is for</h2>
                        <ul className="space-y-2 text-sm">
                          {course.targetAudience.map((a, index) => (
                            <li key={index} className="flex gap-2">
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
                              <span>{a}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {course.cpdCatalog && (
                  <div className="flex items-start gap-4 rounded-lg border p-5">
                    <div className="rounded-full border p-2.5">
                      <BadgeCheck className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="font-semibold">CPD accredited</h2>
                      {course.cpdCatalog.name.split("\n").map((line, i) => (
                        <p key={i} className="text-sm text-muted-foreground">{line}</p>
                      ))}
                      <p className="text-sm font-medium">{Number(course.cpdCatalog.points)} CPD points on completion</p>
                    </div>
                  </div>
                )}
              </section>

              {/* Curriculum */}
              <section id="curriculum" className="scroll-mt-32">
                <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
                  <h2 className="text-xl md:text-2xl font-bold">Curriculum</h2>
                  <p className="text-sm text-muted-foreground">
                    {plural(course.sections.length, "section")} · {plural(totalLectures, "lecture")} · {durationText}
                  </p>
                </div>
                <div className="overflow-hidden rounded-lg border divide-y">
                  {course.sections.map((section, sIndex) => {
                    const sectionLength = section.lectures.reduce((a, l) => a + (l.videoDuration || 0), 0)
                    const done = section.lectures.filter((l) => completedIds.has(l.id)).length
                    const isOpen = openAll || sIndex === 0 || section.id === nextSectionId
                    return (
                      <details key={section.id} className="group" open={isOpen}>
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                          <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 transition-transform group-open:rotate-0" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold leading-snug">
                              <span className="text-muted-foreground font-normal">Section {sIndex + 1} · </span>
                              {section.title}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {isEnrolled ? `${done}/${section.lectures.length} done` : plural(section.lectures.length, "lecture")}
                            {sectionLength > 0 && ` · ${formatTotalLength(sectionLength)}`}
                          </span>
                        </summary>
                        <ol className="border-t">
                          {section.lectures.map((lecture, lIndex) => {
                            const Icon = lectureIcon[lecture.type] || FileText
                            const done = completedIds.has(lecture.id)
                            const canOpen = isEnrolled
                            const row = (
                              <>
                                <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">
                                  {done ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Completed" />
                                  ) : (
                                    `${sIndex + 1}.${lIndex + 1}`
                                  )}
                                </span>
                                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                <span className="min-w-0 flex-1 text-sm leading-snug">
                                  {lecture.title}
                                  <span className="sr-only"> ({LECTURE_TYPE_LABEL[lecture.type] ?? "Lecture"})</span>
                                </span>
                                {lecture.isFreePreview && !isEnrolled && (
                                  <Badge variant="outline" className="text-[11px]">Preview</Badge>
                                )}
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                  {lecture.videoDuration
                                    ? formatClock(lecture.videoDuration)
                                    : LECTURE_TYPE_LABEL[lecture.type] ?? ""}
                                </span>
                                {!canOpen && !lecture.isFreePreview && (
                                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                                )}
                              </>
                            )
                            return (
                              <li key={lecture.id} className="border-t first:border-t-0">
                                {canOpen ? (
                                  <Link
                                    href={`/my-courses/${course.id}/lectures/${lecture.id}`}
                                    className="flex items-center gap-3 px-4 py-3 pl-11 hover:bg-muted/50"
                                  >
                                    {row}
                                  </Link>
                                ) : (
                                  <div className="flex items-center gap-3 px-4 py-3 pl-11">{row}</div>
                                )}
                              </li>
                            )
                          })}
                        </ol>
                      </details>
                    )
                  })}
                </div>
                {!isEnrolled && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Enrol to unlock every lecture. Your progress saves automatically, so you can stop and resume on any device.
                  </p>
                )}
              </section>

              {/* Instructor */}
              <section id="instructor" className="scroll-mt-32">
                <h2 className="text-xl md:text-2xl font-bold mb-4">Your instructor</h2>
                <div className="flex gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={course.instructor.image || ""} alt="" />
                    <AvatarFallback className="text-xl">{course.instructor.name?.[0] || "I"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 space-y-1">
                    <Link href={`/instructors/${course.instructor.id}`} className="text-lg font-semibold hover:underline">
                      {course.instructor.name}
                    </Link>
                    {course.instructor.headline && (
                      <p className="text-sm text-muted-foreground">{course.instructor.headline}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {plural(course.instructor._count.courses, "published course")}
                    </p>
                  </div>
                </div>
                {course.instructor.bio && (
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{course.instructor.bio}</p>
                )}
              </section>

              {/* Reviews */}
              <section id="reviews" className="scroll-mt-32">
                <h2 className="text-xl md:text-2xl font-bold mb-4">Learner reviews</h2>
                {course._count.reviews === 0 && !isEnrolled ? (
                  <div className="rounded-lg border p-5 text-sm text-muted-foreground">
                    This course is new and hasn&apos;t been reviewed yet. Learners who enrol can share a rating after their first lectures.
                  </div>
                ) : (
                <CourseReviewsSection
                  courseId={course.id}
                  isEnrolled={isEnrolled}
                  isOwner={isOwner}
                  initialReviews={JSON.parse(JSON.stringify(reviewData.reviews))}
                  initialTotal={reviewData.total}
                  initialTotalPages={reviewData.totalPages}
                  initialRatingDistribution={reviewData.ratingDistribution}
                  initialAverageRating={rating}
                  initialTotalReviews={course._count.reviews}
                  userReview={userReview ? JSON.parse(JSON.stringify(userReview)) : null}
                />
                )}
              </section>
            </div>
          </div>

          {/* ───────────── Desktop sidebar ───────────── */}
          <aside className="hidden lg:block" aria-label="Enrolment">
            <div className="sticky top-20">
              <Card className="overflow-hidden py-0 shadow-sm">
                <div className="p-3 pb-0">
                  <CoursePreview
                    title={course.title}
                    thumbnail={course.thumbnail}
                    previewSrc={previewSrc}
                    startHref={isEnrolled ? startHref : null}
                  />
                </div>
                <CardContent className="p-5">{purchasePanel}</CardContent>
              </Card>
            </div>
          </aside>
        </div>
      </div>

      <MobileBottomBar
        courseId={course.id}
        courseSlug={slug}
        isFree={isFreeCourse}
        isEnrolled={isEnrolled}
        priceLabel={priceLabel}
        startHref={startHref}
        hasProgress={hasProgress}
        progress={enrollment?.progress ?? 0}
      />
    </div>
  )
}
