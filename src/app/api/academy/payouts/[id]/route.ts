import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { updatePayoutStatus, type StatusTransition } from "@/lib/payouts"

/**
 * PATCH /api/academy/payouts/[id]
 * Progress a payout batch through its lifecycle.
 *   DRAFT    → APPROVED | CANCELLED
 *   APPROVED → PAID | CANCELLED
 *   PAID     → (terminal)
 *   CANCELLED → (terminal; releases attached legs back to the pool)
 */

const schema = z.object({
  status: z.enum(["APPROVED", "PAID", "CANCELLED"]),
  processorRef: z.string().max(200).optional(),
  reason: z.string().max(500).optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const batch = await prisma.payoutBatch.findUnique({
    where: { id },
    select: { academyId: true },
  })
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  const isAdmin = session.user.memberships?.some(
    (m) => m.academyId === batch.academyId && m.role === "ACADEMY_ADMIN"
  )
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const transition: StatusTransition =
    parsed.data.status === "APPROVED"
      ? { to: "APPROVED", actorUserId: session.user.id }
      : parsed.data.status === "PAID"
      ? { to: "PAID", actorUserId: session.user.id, processorRef: parsed.data.processorRef }
      : { to: "CANCELLED", actorUserId: session.user.id, reason: parsed.data.reason }

  try {
    const updated = await updatePayoutStatus(id, transition)
    return NextResponse.json({ batch: updated })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 409 }
    )
  }
}
