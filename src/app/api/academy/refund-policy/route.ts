import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"

// GET — public, returns refund policy HTML for the first active academy
export async function GET() {
  const academy = await prisma.academy.findFirst({
    where: { isActive: true },
    select: { id: true, name: true, refundPolicyHtml: true },
  })

  return NextResponse.json({
    data: {
      academyName: academy?.name ?? "IES Digital Academy",
      refundPolicyHtml: academy?.refundPolicyHtml ?? null,
    },
  })
}

// PUT — Academy Admin only, update refund policy HTML
export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  const isAdmin = session.user.memberships?.some((m) => m.role === "ACADEMY_ADMIN")
  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const { refundPolicyHtml } = body

  if (typeof refundPolicyHtml !== "string") {
    return NextResponse.json({ message: "refundPolicyHtml must be a string" }, { status: 400 })
  }

  // Find the academy the admin belongs to
  const membership = session.user.memberships?.find((m) => m.role === "ACADEMY_ADMIN")
  const academyId = membership?.academyId

  if (!academyId && !isOwner) {
    return NextResponse.json({ message: "No academy found" }, { status: 400 })
  }

  const targetAcademyId = academyId ?? (await prisma.academy.findFirst({ where: { isActive: true }, select: { id: true } }))?.id

  if (!targetAcademyId) {
    return NextResponse.json({ message: "No academy found" }, { status: 404 })
  }

  await prisma.academy.update({
    where: { id: targetAcademyId },
    data: { refundPolicyHtml },
  })

  await audit({
    action: "academy.refund_policy.update",
    resourceType: "academy",
    resourceId: targetAcademyId,
    userId: session.user.id,
    academyId: targetAcademyId,
  })

  return NextResponse.json({ data: { success: true } })
}
