import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Spec §1 governance — only Platform Owners may view (and change) global
// role assignments. Platform Support has read-only audit access elsewhere.
async function requirePlatformOwner() {
  const session = await auth()
  if (!session?.user) {
    return { ok: false as const, status: 401, error: "Unauthorized" }
  }
  if (session.user.platformRole !== "PLATFORM_OWNER") {
    return { ok: false as const, status: 403, error: "Platform Owner only" }
  }
  return { ok: true as const, session }
}

export async function GET(request: Request) {
  const gate = await requirePlatformOwner()
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const url = new URL(request.url)
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? ""

  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {}

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      platformRole: true,
      academyMemberships: {
        select: {
          academyId: true,
          role: true,
          academy: { select: { id: true, name: true, slug: true } },
        },
      },
    },
    take: 200,
  })

  return NextResponse.json({ users })
}
