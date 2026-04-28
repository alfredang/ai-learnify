import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"

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

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  brandingLogoUrl: z.string().url().nullable().optional(),
  secondaryLogoUrl: z.string().url().nullable().optional(),
  primaryCurrency: z.string().length(3).optional(),
  taxJurisdiction: z.string().max(40).nullable().optional(),
  taxRegistrationNumber: z.string().max(80).nullable().optional(),
  aiEnabled: z.boolean().optional(),
  bannerRotationMs: z.number().int().min(1500).max(60_000).optional(),
  supportedLanguages: z.array(z.string().min(1).max(40)).max(40).optional(),
  defaultDeveloperSplitBps: z.number().int().min(0).max(10_000).optional(),
})

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  for (const k of [
    "name",
    "brandingLogoUrl",
    "secondaryLogoUrl",
    "primaryCurrency",
    "taxJurisdiction",
    "taxRegistrationNumber",
    "aiEnabled",
    "bannerRotationMs",
    "supportedLanguages",
    "defaultDeveloperSplitBps",
  ] as const) {
    if (parsed.data[k] !== undefined) data[k] = parsed.data[k]
  }

  if (data.primaryCurrency) {
    data.primaryCurrency = (data.primaryCurrency as string).toUpperCase()
  }
  if (Array.isArray(data.supportedLanguages)) {
    const seen = new Set<string>()
    data.supportedLanguages = (data.supportedLanguages as string[])
      .map((s) => s.trim())
      .filter((s) => s && !seen.has(s.toLowerCase()) && (seen.add(s.toLowerCase()), true))
    if ((data.supportedLanguages as string[]).length === 0) {
      return NextResponse.json(
        { error: "At least one language is required", code: "EMPTY_LANGUAGES" },
        { status: 400 }
      )
    }
  }

  const academy = await prisma.academy.update({
    where: { id: academyId },
    data,
    select: {
      id: true,
      name: true,
      slug: true,
      brandingLogoUrl: true,
      secondaryLogoUrl: true,
      primaryCurrency: true,
      taxJurisdiction: true,
      taxRegistrationNumber: true,
      aiEnabled: true,
      bannerRotationMs: true,
      supportedLanguages: true,
      defaultDeveloperSplitBps: true,
    },
  })

  await audit({
    action: "academy.update",
    resourceType: "academy",
    resourceId: academyId,
    userId: session.user.id,
    academyId,
    metadata: data,
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ academy })
}
