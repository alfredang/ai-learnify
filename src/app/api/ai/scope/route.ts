import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { runAiAssist } from "@/lib/ai/assist"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * POST /api/ai/scope — Course Scoping (Spec §8 — Phase 7).
 *
 * Wraps the COURSE_SCOPING capability in `runAiAssist`. The route exists
 * separately from /api/ai/assist so callers can attach a structured
 * input shape (title + audience + constraints) without forcing every
 * draft caller through that schema.
 */

const schema = z.object({
  academyId: z.string().min(1),
  title: z.string().min(3).max(200),
  audience: z.string().min(2).max(500),
  constraints: z.string().max(2000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const input = parsed.data

  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  const allowedRoles = new Set(["ACADEMY_ADMIN", "COURSE_DEVELOPER"])
  const isMember = session.user.memberships?.some(
    (m) => m.academyId === input.academyId && allowedRoles.has(m.role)
  )
  if (!isOwner && !isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const academy = await prisma.academy.findUnique({
    where: { id: input.academyId },
    select: { id: true },
  })
  if (!academy) {
    return NextResponse.json({ error: "Academy not found" }, { status: 404 })
  }

  const userPrompt = [
    `Course title: ${input.title}`,
    `Audience: ${input.audience}`,
    input.constraints
      ? `Constraints / context: ${input.constraints}`
      : "Constraints / context: (none provided)",
    "",
    "Produce the scope brief per the system prompt. Return ONLY the JSON object.",
  ].join("\n")

  try {
    const result = await runAiAssist({
      capability: "COURSE_SCOPING",
      academyId: input.academyId,
      userId: session.user.id,
      userPrompt,
      context: input.context,
      // Course scoping is a single-turn JSON task — keep maxTurns=1.
      maxTurns: 1,
    })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Course scoping failed"
    const status =
      msg.includes("disabled for this academy") ||
      msg.includes("AI is not configured")
        ? 409
        : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
