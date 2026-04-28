import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"

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

const bodySchema = z.object({
  to: z.string().email(),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const result = await sendEmail({
    to: parsed.data.to,
    subject: "Learnify integration test",
    html: `<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a202c;">
  <h1 style="font-size:20px;">Integration test</h1>
  <p>This is a test message sent from your Academy Integrations page. If you received it, the active provider is configured correctly.</p>
  <p style="color:#718096;font-size:12px;margin-top:24px;">Sent at ${new Date().toISOString()}</p>
</body></html>`,
    purpose: "test",
    academyId,
    context: { sentBy: session.user.id, testTarget: parsed.data.to },
  })

  return NextResponse.json({
    ok: result.ok,
    provider: result.provider ?? "none",
    skipped: Boolean(result.skipped),
    reason: result.reason ?? null,
    providerId: result.providerId ?? null,
  })
}
