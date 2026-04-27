import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { AuditLogTable } from "@/components/shared/audit-log-table"

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

export default async function AcademyAuditPage() {
  const session = await auth()
  if (!session?.user) return null

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return null

  const rows = await prisma.auditLog.findMany({
    where: { academyId },
    orderBy: { createdAt: "desc" },
    take: 200,
  })

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Last 200 tenant-scoped events. Append-only per spec §18 (GDPR / PDPA).
        </p>
      </div>
      <AuditLogTable rows={rows} />
    </div>
  )
}
