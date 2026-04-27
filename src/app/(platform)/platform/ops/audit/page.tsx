import { prisma } from "@/lib/prisma"
import { AuditLogTable } from "@/components/shared/audit-log-table"

export default async function OpsAuditPage() {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    where: {
      action: {
        in: [
          "user.register",
          "certificate.issued",
          "banner.create",
          "banner.delete",
          "banner.update",
          "survey.submit",
          "assessment.submit",
        ],
      },
    },
  })

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Operational audit log</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Security-relevant events only. Use Platform Owner audit for the full
          stream.
        </p>
      </div>
      <AuditLogTable rows={rows} />
    </div>
  )
}
