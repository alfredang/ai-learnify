import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { AuditLogTable } from "@/components/shared/audit-log-table"

export default async function PlatformAuditPage() {
  const session = await auth()
  if (!session?.user) return null

  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  })

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Global audit log</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Last 500 events across every academy. Append-only per spec §18.
        </p>
      </div>
      <AuditLogTable rows={rows} />
    </div>
  )
}
