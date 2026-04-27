import { NextResponse } from "next/server"
import { z } from "zod"
import type { PayoutGroup } from "@prisma/client"
import { auth } from "@/lib/auth"
import {
  buildPayoutBatch,
  listPayoutBatches,
  previewPayoutBatch,
} from "@/lib/payouts"

/**
 * Spec §15: Academy Admin payout generation + listing.
 *
 *   GET  /api/academy/payouts?academyId=...&payoutGroup=...&status=...
 *   POST /api/academy/payouts              — generate (or preview) a batch
 */

const payoutGroupValues = ["ACADEMY", "DEVELOPER", "MARKETER", "PLATFORM_SUPPORT"] as const
const statusValues = ["DRAFT", "APPROVED", "PAID", "CANCELLED"] as const

const postSchema = z.object({
  academyId: z.string().min(1),
  payoutGroup: z.enum(payoutGroupValues),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  currency: z.string().length(3).optional(),
  notes: z.string().max(500).optional(),
  preview: z.boolean().optional(),
})

type Session = Awaited<ReturnType<typeof auth>>

function authorizeAcademyAdmin(session: Session, academyId: string): string | null {
  if (!session?.user) return "Unauthorized"
  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  const isAdmin = session.user.memberships?.some(
    (m) => m.academyId === academyId && m.role === "ACADEMY_ADMIN"
  )
  if (!isOwner && !isAdmin) return "Forbidden"
  return null
}

export async function GET(request: Request) {
  const session = await auth()
  const url = new URL(request.url)
  const academyId = url.searchParams.get("academyId")
  if (!academyId) return NextResponse.json({ error: "academyId required" }, { status: 400 })

  const err = authorizeAcademyAdmin(session, academyId)
  if (err) return NextResponse.json({ error: err }, { status: err === "Unauthorized" ? 401 : 403 })

  const rawGroup = url.searchParams.get("payoutGroup")
  const rawStatus = url.searchParams.get("status")
  const payoutGroup = rawGroup && (payoutGroupValues as readonly string[]).includes(rawGroup)
    ? (rawGroup as PayoutGroup)
    : undefined
  const status = rawStatus && (statusValues as readonly string[]).includes(rawStatus)
    ? (rawStatus as (typeof statusValues)[number])
    : undefined

  const batches = await listPayoutBatches(academyId, { payoutGroup, status })
  return NextResponse.json({ batches })
}

export async function POST(request: Request) {
  const session = await auth()
  const parsed = postSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const input = parsed.data
  const err = authorizeAcademyAdmin(session, input.academyId)
  if (err) return NextResponse.json({ error: err }, { status: err === "Unauthorized" ? 401 : 403 })

  const args = {
    academyId: input.academyId,
    payoutGroup: input.payoutGroup,
    periodStart: new Date(input.periodStart),
    periodEnd: new Date(input.periodEnd),
    currency: input.currency,
    notes: input.notes,
    actorUserId: session!.user.id,
  }

  if (input.preview) {
    const preview = await previewPayoutBatch(args)
    return NextResponse.json({ preview })
  }

  try {
    const result = await buildPayoutBatch(args)
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Build failed" },
      { status: 409 }
    )
  }
}
