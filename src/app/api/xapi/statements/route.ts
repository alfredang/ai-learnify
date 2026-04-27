import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { randomUUID } from "node:crypto"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Phase 6 — Spec §7.1: minimal xAPI 1.0.3 Learning Record Store (LRS).
 *
 * POST /api/xapi/statements    accepts a single statement or an array
 * GET  /api/xapi/statements?statementId=…  returns one statement (for LRS GET
 *                                          conformance; no query-by-actor etc.)
 *
 * Authentication: any logged-in user may write their own statements. A
 * future revision should issue per-learner "basic auth" credentials to match
 * the xAPI spec's HTTP Basic auth pattern for external content launches;
 * for now we piggy-back on the session cookie so in-app content launches
 * work without extra plumbing.
 *
 * Validation is deliberately lightweight: we enforce the three mandatory
 * xAPI fields (actor, verb, object) plus an IRI for each, and we assign a
 * statementId if the client omits one. Richer validation (context, result,
 * attachments, voided statements) lands when analytics needs it.
 */

const actorSchema = z.object({
  objectType: z.literal("Agent").optional(),
  name: z.string().optional(),
  mbox: z.string().startsWith("mailto:").optional(),
  mbox_sha1sum: z.string().optional(),
  openid: z.string().url().optional(),
  account: z.object({ homePage: z.string().url(), name: z.string() }).optional(),
}).refine(
  (a) => a.mbox || a.mbox_sha1sum || a.openid || a.account,
  { message: "actor must include one of: mbox, mbox_sha1sum, openid, account" }
)

const statementSchema = z.object({
  id: z.string().uuid().optional(),
  actor: actorSchema,
  verb: z.object({
    id: z.string().url(),
    display: z.record(z.string(), z.string()).optional(),
  }),
  object: z.object({
    objectType: z.string().optional(),
    id: z.string().url(),
    definition: z.record(z.string(), z.unknown()).optional(),
  }),
  result: z.record(z.string(), z.unknown()).optional(),
  context: z.object({
    extensions: z.record(z.string(), z.unknown()).optional(),
    contextActivities: z.record(z.string(), z.unknown()).optional(),
  }).partial().optional(),
  timestamp: z.string().datetime().optional(),
}).passthrough()

function actorIri(actor: z.infer<typeof actorSchema>): string {
  if (actor.mbox) return actor.mbox
  if (actor.openid) return actor.openid
  if (actor.account) return `account::${actor.account.homePage}::${actor.account.name}`
  return `mbox_sha1sum::${actor.mbox_sha1sum}`
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const batch = Array.isArray(body) ? body : [body]
  const parsed: Array<z.infer<typeof statementSchema>> = []
  for (const [i, raw] of batch.entries()) {
    const r = statementSchema.safeParse(raw)
    if (!r.success) {
      return NextResponse.json(
        { error: `Invalid statement at index ${i}`, issues: r.error.issues },
        { status: 400 }
      )
    }
    parsed.push(r.data)
  }

  // Look up course/lecture references if extensions carry them — this keeps
  // the LRS joinable with the rest of the data model for dashboards.
  const extIds = (ctx: unknown): { courseId?: string; lectureId?: string } => {
    const ext = (ctx as { extensions?: Record<string, unknown> } | undefined)
      ?.extensions
    if (!ext) return {}
    const out: { courseId?: string; lectureId?: string } = {}
    if (typeof ext["https://learnify.local/ext/courseId"] === "string") {
      out.courseId = ext["https://learnify.local/ext/courseId"] as string
    }
    if (typeof ext["https://learnify.local/ext/lectureId"] === "string") {
      out.lectureId = ext["https://learnify.local/ext/lectureId"] as string
    }
    return out
  }

  const ids: string[] = []
  for (const s of parsed) {
    const statementId = s.id ?? randomUUID()
    const { courseId, lectureId } = extIds(s.context)

    await prisma.xapiStatement.create({
      data: {
        statementId,
        actorIri: actorIri(s.actor),
        verbIri: s.verb.id,
        objectIri: s.object.id,
        activityId:
          s.object.objectType === "Activity" || !s.object.objectType
            ? s.object.id
            : null,
        courseId: courseId ?? null,
        lectureId: lectureId ?? null,
        userId: session.user.id,
        statement: s as unknown as Prisma.InputJsonValue,
        timestamp: s.timestamp ? new Date(s.timestamp) : new Date(),
      },
    })
    ids.push(statementId)
  }

  // Per xAPI 1.0.3 §7.2: LRS returns the array of statement ids with 200.
  return NextResponse.json(ids, { status: 200 })
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const url = new URL(request.url)
  const statementId = url.searchParams.get("statementId")
  if (!statementId) {
    return NextResponse.json(
      { error: "statementId required (query API not implemented yet)" },
      { status: 400 }
    )
  }
  const row = await prisma.xapiStatement.findUnique({
    where: { statementId },
    select: { statement: true },
  })
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(row.statement)
}
