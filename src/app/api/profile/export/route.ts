import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"

/**
 * Phase 9 — Spec §18 GDPR / PDPA data portability.
 *
 *   GET /api/profile/export → streaming JSON of everything we know about
 *   the calling learner: profile, memberships, access grants, progress,
 *   certificates, purchases, surveys, invoices, audit trail.
 *
 * Payment-instrument details (card numbers, Stripe tokens) are never
 * stored on our side, so they can't be exported. Password hashes and
 * session cookies are excluded for safety.
 */

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id

  const [
    user,
    academyMemberships,
    accessGrants,
    lectureProgress,
    certificates,
    assessmentAttempts,
    surveyResponses,
    purchases,
    invoices,
    reviews,
    wishlist,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        nameToBeCalled: true,
        certificateName: true,
        certificateIdNumber: true,
        image: true,
        headline: true,
        bio: true,
        website: true,
        twitter: true,
        linkedin: true,
        youtube: true,
        platformRole: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.academyMembership.findMany({
      where: { userId },
      select: {
        role: true,
        createdAt: true,
        academy: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.accessGrant.findMany({
      where: { userId },
      select: {
        id: true,
        productType: true,
        courseId: true,
        programmeId: true,
        source: true,
        grantedAt: true,
        expiresAt: true,
        isActive: true,
        revokedAt: true,
        revokedReason: true,
      },
    }),
    prisma.lectureProgress.findMany({
      where: { userId },
      select: {
        lectureId: true,
        isCompleted: true,
        watchedDuration: true,
        lastPosition: true,
        updatedAt: true,
      },
    }),
    prisma.certificate.findMany({
      where: { userId },
      select: {
        id: true,
        certificateId: true,
        courseId: true,
        courseName: true,
        instructorName: true,
        nameToBeCalled: true,
        certificateName: true,
        contentCompletionPct: true,
        assessmentScorePct: true,
        issuedAt: true,
        revokedAt: true,
      },
    }),
    prisma.assessmentAttempt.findMany({
      where: { userId },
      select: {
        lectureId: true,
        attemptNumber: true,
        scorePct: true,
        pointsEarned: true,
        maxPoints: true,
        passed: true,
        submittedAt: true,
      },
    }),
    prisma.surveyResponse.findMany({
      where: { userId },
      select: {
        surveyId: true,
        starRating: true,
        submittedAt: true,
      },
    }),
    prisma.purchase.findMany({
      where: { userId },
      select: {
        id: true,
        courseId: true,
        amount: true,
        status: true,
        stripeSessionId: true,
        createdAt: true,
      },
    }),
    prisma.invoice.findMany({
      where: { userId },
      select: {
        id: true,
        invoiceNumber: true,
        recipientEmail: true,
        grossMinor: true,
        discountMinor: true,
        taxMinor: true,
        netMinor: true,
        currency: true,
        issuedAt: true,
      },
    }),
    prisma.review.findMany({
      where: { userId },
      select: {
        courseId: true,
        rating: true,
        comment: true,
        createdAt: true,
      },
    }),
    prisma.wishlist.findMany({
      where: { userId },
      select: { courseId: true, createdAt: true },
    }),
  ])

  const exportedAt = new Date()

  await audit({
    action: "privacy.export",
    resourceType: "user",
    resourceId: userId,
    userId,
    metadata: {
      accessGrants: accessGrants.length,
      certificates: certificates.length,
      purchases: purchases.length,
    },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  const payload = {
    exportedAt: exportedAt.toISOString(),
    spec: "IESA LMS §18 — GDPR / PDPA data export",
    notes: [
      "Password hashes, session cookies, and third-party payment tokens are excluded.",
      "LedgerEntry rows are not included directly; see `invoices` for the settled money breakdown.",
    ],
    user,
    academyMemberships,
    accessGrants,
    lectureProgress,
    certificates,
    assessmentAttempts,
    surveyResponses,
    purchases,
    invoices,
    reviews,
    wishlist,
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="learnify-export-${exportedAt.toISOString().slice(0, 10)}.json"`,
    },
  })
}
