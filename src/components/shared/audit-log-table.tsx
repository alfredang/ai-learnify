import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type AuditRow = {
  id: string
  action: string
  resourceType: string
  resourceId: string | null
  userId: string | null
  academyId: string | null
  metadata: unknown
  createdAt: Date
}

interface AuditLogTableProps {
  rows: AuditRow[]
  emptyText?: string
}

const actionTone: Record<string, "default" | "destructive" | "outline"> = {
  "certificate.issued": "default",
  "banner.delete": "destructive",
  "user.register": "outline",
}

/**
 * Phase 8: shared audit log viewer used by Academy Admin (tenant-scoped),
 * Platform Owner (global), and Platform Support (global). Writes come from
 * src/lib/audit.ts; callers filter the rows by academyId / time range.
 */
export function AuditLogTable({ rows, emptyText }: AuditLogTableProps) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {emptyText ?? "No audit entries yet."}
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Metadata</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(r.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={actionTone[r.action] ?? "outline"} className="font-mono text-xs">
                    {r.action}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {r.resourceType}
                  {r.resourceId && (
                    <span className="text-muted-foreground"> · {r.resourceId.slice(-8)}</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.userId ? r.userId.slice(-8) : "system"}
                </TableCell>
                <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                  {r.metadata ? JSON.stringify(r.metadata) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
