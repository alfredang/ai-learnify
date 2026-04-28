import Image from "next/image"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { formatPrice } from "@/lib/stripe"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  ArrowLeft,
  CheckCircle,
  Award,
  Clock,
  Layers,
  PartyPopper,
  BookOpen,
} from "lucide-react"
import { ProgrammeEnrollButton } from "./enroll-button"

interface EnrollPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ success?: string }>
}

async function getProgramme(slug: string) {
  try {
    return await prisma.programme.findUnique({
      where: { slug, status: "PUBLISHED" },
      include: {
        courses: {
          orderBy: { position: "asc" },
          include: {
            course: {
              select: { id: true, title: true, thumbnail: true },
            },
          },
        },
      },
    })
  } catch {
    return null
  }
}

export default async function ProgrammeEnrollPage({ params, searchParams }: EnrollPageProps) {
  const [{ slug }, { success }] = await Promise.all([params, searchParams])

  const session = await auth()
  if (!session?.user) {
    redirect(`/login?callbackUrl=/programmes/${slug}/enroll`)
  }

  const programme = await getProgramme(slug)
  if (!programme) notFound()

  const price = Number(programme.price)

  // Check existing access
  const existingGrant = await prisma.accessGrant.findFirst({
    where: {
      userId: session.user.id,
      programmeId: programme.id,
      productType: "PROGRAMME",
      isActive: true,
    },
  })

  // Success state
  if (success === "true" || existingGrant) {
    return (
      <div className="container py-12">
        <div className="max-w-lg mx-auto text-center">
          <Card>
            <CardContent className="p-8 space-y-6">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
                <PartyPopper className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold">You&apos;re enrolled!</h1>
                <p className="text-muted-foreground">
                  You now have access to all {programme.courses.length} courses in{" "}
                  <strong>{programme.title}</strong> for {programme.accessDurationDays} days.
                </p>
              </div>
              <Button size="lg" asChild>
                <Link href="/learner/programmes">Go to My Programmes</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="container py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href={`/programmes/${slug}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to programme
        </Link>

        <h1 className="text-2xl font-bold mb-6">Checkout</h1>

        <div className="space-y-6">
          {/* Order Summary */}
          <Card>
            <CardContent className="p-6">
              <h2 className="font-semibold mb-4">Order summary</h2>
              <div className="flex gap-4">
                <div className="relative w-44 aspect-video flex-shrink-0 rounded overflow-hidden bg-muted">
                  {programme.thumbnail ? (
                    <Image
                      src={programme.thumbnail}
                      alt={programme.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Layers className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold line-clamp-2">{programme.title}</h3>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Layers className="h-3 w-3" />
                      {programme.courses.length} courses
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {programme.accessDurationDays}-day access
                    </span>
                  </div>
                </div>
              </div>

              {/* Course list */}
              <div className="mt-4 space-y-2">
                {programme.courses.map((pc) => (
                  <div
                    key={pc.id}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <BookOpen className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{pc.course.title}</span>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="text-2xl font-bold">
                  {programme.isFree ? "Free" : formatPrice(price)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Benefits */}
          <Card>
            <CardContent className="p-6">
              <h2 className="font-semibold mb-4">What&apos;s included</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Layers className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>{programme.courses.length} courses in one package</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>{programme.accessDurationDays}-day shared access window</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Award className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>Certificate per course completed</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>Single payment for all courses</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Enroll Button */}
          <ProgrammeEnrollButton
            programmeId={programme.id}
            isFree={programme.isFree}
          />

          <p className="text-xs text-center text-muted-foreground">
            {programme.isFree
              ? "Start learning immediately after enrollment"
              : "You will be redirected to our secure payment page"}
          </p>
        </div>
      </div>
    </div>
  )
}
