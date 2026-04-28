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

async function loadOwnedTemplate(id: string, academyId: string) {
  return prisma.certificateTemplate.findFirst({
    where: { id, academyId },
  })
}

/** PATCH — partial update. Toggling isDefault → true clears every sibling. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const existing = await loadOwnedTemplate(id, academyId)
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = certificateTemplateSchema.partial().safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const data = parsed.data
  const template = await prisma.$transaction(async (tx) => {
    if (data.isDefault === true) {
      await tx.certificateTemplate.updateMany({
        where: { academyId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      })
    }
    return tx.certificateTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.primaryLogoUrl !== undefined && { primaryLogoUrl: data.primaryLogoUrl }),
        ...(data.secondaryLogoUrl !== undefined && { secondaryLogoUrl: data.secondaryLogoUrl }),
        ...(data.signatoryName !== undefined && { signatoryName: data.signatoryName }),
        ...(data.signatoryTitle !== undefined && { signatoryTitle: data.signatoryTitle }),
        ...(data.layoutJson !== undefined && { layoutJson: data.layoutJson ?? undefined }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      },
    })
  })

  await audit({
    action: "certificateTemplate.update",
    resourceType: "certificateTemplate",
    resourceId: template.id,
    userId: session.user.id,
    academyId,
    metadata: { fields: Object.keys(data) },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ template })
}

/**
 * DELETE — refuse if any issued Certificate references this template,
 * since deleting would orphan historical records (Certificate.templateId
 * is `onDelete` SET NULL by default but the snapshot lives on so the
 * record survives; we still block to keep admin intent explicit).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const existing = await loadOwnedTemplate(id, academyId)
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const inUse = await prisma.certificate.count({ where: { templateId: id } })
  if (inUse > 0) {
    return NextResponse.json(
      {
        error: `Template is used by ${inUse} issued certificate(s). Mark another template default and reissue, or keep this template.`,
        code: "TEMPLATE_IN_USE",
      },
      { status: 409 }
    )
  }

  await prisma.certificateTemplate.delete({ where: { id } })

  await audit({
    action: "certificateTemplate.delete",
    resourceType: "certificateTemplate",
    resourceId: id,
    userId: session.user.id,
    academyId,
    metadata: { name: existing.name },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ message: "Deleted" })
}
