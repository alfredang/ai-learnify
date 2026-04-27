import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { approveAiInteraction } from "@/lib/ai/assist"

/**
 * POST /api/ai/approve — author approves a draft so it can be used as
 * canonical course content (spec §8.1 "AI outputs are drafts only — author
 * approval required before publish").
 */

const schema = z.object({
  interactionId: z.string().min(1),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const interaction = await prisma.aiInteraction.findUnique({
    where: { id: parsed.data.interactionId },
    select: { id: true, academyId: true, userId: true },
  })
  if (!interaction) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  const isOriginalAuthor = interaction.userId === session.user.id
  const isAcademyAdmin = session.user.memberships?.some(
    (m) => m.academyId === interaction.academyId && m.role === "ACADEMY_ADMIN"
  )
  if (!(isOwner || isOriginalAuthor || isAcademyAdmin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    await approveAiInteraction(parsed.data.interactionId, session.user.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Approve failed" },
      { status: 500 }
    )
  }
}
