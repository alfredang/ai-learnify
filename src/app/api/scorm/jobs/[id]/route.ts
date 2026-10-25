import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canUseStudio } from "@/lib/scorm/authz"

export const runtime = "nodejs"

/** GET /api/scorm/jobs/[id] — full job state including the step trace. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const job = await prisma.scormBuildJob.findUnique({ where: { id } })
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (job.userId !== session.user.id && !canUseStudio(session, job.academyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { transcript: _transcript, ...rest } = job
  void _transcript
  return NextResponse.json({ data: rest })
}
