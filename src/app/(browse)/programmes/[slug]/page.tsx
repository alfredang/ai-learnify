import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { formatPrice } from "@/lib/stripe"
import {
  Layers,
  Clock,
  BookOpen,
  Award,
  CheckCircle,
  LogIn,
} from "lucide-react"

interface ProgrammePageProps {
  params: Promise<{ slug: string }>
}

async function getProgramme(slug: string) {
  try {
    return await prisma.programme.findUnique({
      where: { slug, status: "PUBLISHED" },
      include: {
        academy: { select: { name: true } },
        courses: {
          orderBy: { position: "asc" },
          include: {
            course: {
              select: {
                id: true,
                title: true,
                slug: true,
                thumbnail: true,
                subtitle: true,
                level: true,
                language: true,
                sections: {
                  include: {
                    lectures: { select: { id: true, videoDuration: true } },
                  },
                },
                _count: { select: { enrollments: true } },
              },
            },
          },
        },
      },
    })
  } catch {
    return null
  }
}

async function checkProgrammeAccess(programmeId: string, userId?: string) {
  if (!userId) return false
  const grant = await prisma.accessGrant.findFirst({
    where: { userId, programmeId, productType: "PROGRAMME", isActive: true },
  })
  return !!grant
}

export async function generateMetadata({ params }: ProgrammePageProps): Promise<Metadata> {
  const { slug } = await params
  const programme = await getProgramme(slug)
  if (!programme) return { title: "Programme Not Found" }
  return {
    title: programme.title,
    description: programme.subtitle || programme.description?.slice(0, 160),
  }
}

export default async function ProgrammeDetailPage({ params }: ProgrammePageProps) {
  const { slug } = await params
  const session = await auth()
  const programme = await getProgramme(slug)

  if (!programme) notFound()

  const hasAccess = await checkProgrammeAccess(programme.id, session?.user?.id)
  const price = Number(programme.price)
  const isFreeProgramme = programme.isFree || price === 0

  const totalCourses = programme.courses.length
  const totalLectures = programme.courses.reduce(
    (acc, pc) =>
      acc + pc.course.sections.reduce((sa, s) => sa + s.lectures.length, 0),
    0
  )
  const totalDuration = programme.courses.reduce(
    (acc, pc) =>
      acc +
      pc.course.sections.reduce(
        (sa, s) =>
          sa + s.lectures.reduce((la, l) => la + (l.videoDuration || 0), 0),
        0
      ),
    0
  )
  const hours = Math.floor(totalDuration / 3600)
  const minutes = Math.floor((totalDuration % 3600) / 60)
  const durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-slate-900 text-white py-8 lg:py-12">
        <div className="container">
          <div className="lg:max-w-[63%] space-y-6">
            <Badge variant="secondary" className="bg-white/10 text-white border-white/20">
              Programme
            </Badge>

            <h1 className="text-3xl md:text-4xl font-bold">{programme.title}</h1>

            {programme.subtitle && (
              <p className="text-xl text-slate-300">{programme.subtitle}</p>
            )}

            <div className="flex flex-wrap gap-4 text-sm text-slate-300">
              <div className="flex items-center gap-1">
                <Layers className="h-4 w-4" />
                <span>{totalCourses} courses</span>
              </div>
              <div className="flex items-center gap-1">
                <BookOpen className="h-4 w-4" />
                <span>{totalLectures} lectures</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>{durationText} total</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>{programme.accessDurationDays}-day access window</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content + Sidebar */}
      <section className="py-8 lg:py-12">
        <div className="container">
          <div className="lg:grid lg:grid-cols-[1fr_340px] gap-12">
            {/* Left column */}
            <div className="space-y-12">
              {/* Description */}
              {programme.description && (
                <div>
                  <h2 className="text-2xl font-bold mb-4">About this Programme</h2>
                  <div
                    className="prose prose-slate max-w-none"
                    dangerouslySetInnerHTML={{ __html: programme.description }}
                  />
                </div>
              )}

              {/* Courses in this Programme */}
              <div>
                <h2 className="text-2xl font-bold mb-4">
                  Courses included ({totalCourses})
                </h2>
                <div className="space-y-4">
                  {programme.courses.map((pc, index) => {
                    const courseLectures = pc.course.sections.reduce(
                      (a, s) => a + s.lectures.length,
                      0
                    )
                    return (
                      <Card key={pc.id}>
                        <CardContent className="p-4">
                          <div className="flex gap-4">
                            <div className="relative w-32 aspect-video flex-shrink-0 rounded overflow-hidden bg-muted">
                              {pc.course.thumbnail ? (
                                <Image
                                  src={pc.course.thumbnail}
                                  alt={pc.course.title}
                                  fill
                                  className="object-cover"
                                />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <BookOpen className="h-6 w-6 text-muted-foreground/40" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs text-muted-foreground font-medium">
                                  Course {index + 1}
                                </span>
                              </div>
                              <h3 className="font-semibold line-clamp-1">
                                {pc.course.title}
                              </h3>
                              {pc.course.subtitle && (
                                <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                                  {pc.course.subtitle}
                                </p>
                              )}
                              <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                                <span>{courseLectures} lectures</span>
                                <span>{pc.course.level.replace("_", " ")}</span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Right sidebar */}
            <div className="hidden lg:block">
              <div className="sticky top-20">
                <Card className="shadow-lg overflow-hidden">
                  {programme.thumbnail && (
                    <div className="relative aspect-video">
                      <Image
                        src={programme.thumbnail}
                        alt={programme.title}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <CardContent className="p-6 space-y-4">
                    {hasAccess ? (
                      <>
                        <Badge variant="secondary" className="font-semibold text-sm px-3 py-1">
                          Enrolled
                        </Badge>
                        <Button className="w-full" size="lg" asChild>
                          <Link href="/learner/programmes">
                            Go to My Programmes
                          </Link>
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-2">
                          {isFreeProgramme ? (
                            <Badge className="font-semibold text-sm px-3 py-1 bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100">
                              Complimentary
                            </Badge>
                          ) : (
                            <span className="text-3xl font-bold">
                              {formatPrice(price)}
                            </span>
                          )}
                        </div>
                        <Button
                          className="w-full"
                          size="lg"
                          variant="outline"
                          asChild
                        >
                          <Link
                            href={
                              session?.user
                                ? `/programmes/${slug}/enroll`
                                : `/login?callbackUrl=${encodeURIComponent(`/programmes/${slug}/enroll`)}`
                            }
                          >
                            <LogIn className="h-4 w-4 mr-2" />
                            {isFreeProgramme ? "Enrol for Free" : "Join / Enrol"}
                          </Link>
                        </Button>
                      </>
                    )}

                    <Separator />

                    <div className="space-y-3 text-sm">
                      <h4 className="font-semibold">This programme includes:</h4>
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        <span>{totalCourses} courses</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                        <span>{totalLectures} lectures</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{programme.accessDurationDays}-day shared access</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-muted-foreground" />
                        <span>Certificate per course</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-muted-foreground" />
                        <span>Single payment for all courses</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
