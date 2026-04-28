import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"
import { certificateTemplateSchema } from "@/lib/validations/certificate-template"

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

/** GET — list every template for the caller's academy. */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const templates = await prisma.certificateTemplate.findMany({
    where: { academyId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  })
  return NextResponse.json({ templates })
}

/**
 * POST — create a new template. Setting `isDefault: true` clears the flag
 * on every other template in the same academy in the same transaction so
 * exactly one template is the default at any time.
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = certificateTemplateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const data = parsed.data
  const template = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.certificateTemplate.updateMany({
        where: { academyId, isDefault: true },
        data: { isDefault: false },
      })
    }
    return tx.certificateTemplate.create({
      data: {
        academyId,
        name: data.name,
        primaryLogoUrl: data.primaryLogoUrl ?? null,
        secondaryLogoUrl: data.secondaryLogoUrl ?? null,
        signatoryName: data.signatoryName ?? null,
        signatoryTitle: data.signatoryTitle ?? null,
        layoutJson: data.layoutJson ?? undefined,
        isDefault: data.isDefault ?? false,
      },
    })
  })

  await audit({
    action: "certificateTemplate.create",
    resourceType: "certificateTemplate",
    resourceId: template.id,
    userId: session.user.id,
    academyId,
    metadata: { name: template.name, isDefault: template.isDefault },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ template }, { status: 201 })
}
