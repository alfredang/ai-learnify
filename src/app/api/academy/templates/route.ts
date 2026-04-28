import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"

const ALLOWED_FIELDS = [
  "refundPolicyHtml",
  "privacyPolicyHtml",
  "termsHtml",
  "emailWelcomeHtml",
  "emailInvoiceHtml",
  "emailCertificateHtml",
  "emailExpiryReminderHtml",
] as const

type TemplateField = (typeof ALLOWED_FIELDS)[number]

// GET — return all template fields for the admin's academy
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  const academyId = await resolveAcademyId(session)
  if (!academyId) {
    return NextResponse.json({ message: "No academy found" }, { status: 404 })
  }

  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: Object.fromEntries(ALLOWED_FIELDS.map((f) => [f, true])),
  })

  return NextResponse.json({ data: academy })
}

// PUT — update one or more template fields
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

  const academyId = await resolveAcademyId(session)
  if (!academyId) {
    return NextResponse.json({ message: "No academy found" }, { status: 404 })
  }

  const body = await request.json()
  const data: Partial<Record<TemplateField, string>> = {}
  const updated: string[] = []

  for (const field of ALLOWED_FIELDS) {
    if (field in body && typeof body[field] === "string") {
      data[field] = body[field]
      updated.push(field)
    }
  }

  if (updated.length === 0) {
    return NextResponse.json({ message: "No valid fields to update" }, { status: 400 })
  }

  await prisma.academy.update({
    where: { id: academyId },
    data,
  })

  await audit({
    action: "academy.templates.update",
    resourceType: "academy",
    resourceId: academyId,
    userId: session.user.id,
    academyId,
    metadata: { updatedFields: updated },
  })

  return NextResponse.json({ data: { success: true, updated } })
}

async function resolveAcademyId(session: { user: { id: string; platformRole?: string; memberships?: { academyId: string; role: string }[] } }) {
  const membership = session.user.memberships?.find((m) => m.role === "ACADEMY_ADMIN")
  if (membership) return membership.academyId

  if (session.user.platformRole === "PLATFORM_OWNER") {
    const academy = await prisma.academy.findFirst({ where: { isActive: true }, select: { id: true } })
    return academy?.id ?? null
  }

  return null
}
