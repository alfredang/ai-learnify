"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Pencil } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type LegacyRole = "STUDENT" | "INSTRUCTOR" | "ADMIN"
type PlatformRole = "NONE" | "PLATFORM_OWNER" | "PLATFORM_SUPPORT"
type AcademyRole = "LEARNER" | "COURSE_DEVELOPER" | "ACADEMY_ADMIN" | "MARKETER"

// One unified picker covering all six spec roles. Two of them are
// stored on User.platformRole, the other four live as
// AcademyMembership.role.
type UnifiedRole =
  | "PLATFORM_OWNER"
  | "PLATFORM_SUPPORT"
  | "ACADEMY_ADMIN"
  | "COURSE_DEVELOPER"
  | "MARKETER"
  | "LEARNER"

const UNIFIED_ROLE_OPTIONS: { value: UnifiedRole; label: string }[] = [
  { value: "PLATFORM_OWNER", label: "Platform Owner" },
  { value: "PLATFORM_SUPPORT", label: "Platform Support" },
  { value: "ACADEMY_ADMIN", label: "Academy Admin" },
  { value: "COURSE_DEVELOPER", label: "Course Developer" },
  { value: "MARKETER", label: "Marketer / Affiliate" },
  { value: "LEARNER", label: "Learner" },
]

type Membership = {
  academyId: string
  role: AcademyRole
  academy: { id: string; name: string; slug: string }
}

type User = {
  id: string
  name: string | null
  email: string
  image: string | null
  role: LegacyRole
  platformRole: PlatformRole
  createdAt: string
  academyMemberships: Membership[]
  _count: { courses: number; enrollments: number }
}

type Academy = { id: string; name: string; slug: string }

// One badge per row. We collapse platformRole + academyMembership +
// legacy `role` into a single canonical label, picking the highest
// priority signal each user has so the column scans cleanly.
type DisplayRole = {
  label: string
  className: string
}

const ROLE_STYLES: Record<UnifiedRole, string> = {
  PLATFORM_OWNER: "bg-purple-100 text-purple-800",
  PLATFORM_SUPPORT: "bg-indigo-100 text-indigo-800",
  ACADEMY_ADMIN: "bg-amber-100 text-amber-800",
  COURSE_DEVELOPER: "bg-blue-100 text-blue-800",
  MARKETER: "bg-pink-100 text-pink-800",
  LEARNER: "bg-green-100 text-green-800",
}

const ROLE_LABELS: Record<UnifiedRole, string> = Object.fromEntries(
  UNIFIED_ROLE_OPTIONS.map((o) => [o.value, o.label])
) as Record<UnifiedRole, string>

function deriveUnifiedRole(user: User): UnifiedRole {
  if (user.platformRole === "PLATFORM_OWNER") return "PLATFORM_OWNER"
  if (user.platformRole === "PLATFORM_SUPPORT") return "PLATFORM_SUPPORT"
  const m = user.academyMemberships[0]
  if (m) return m.role
  // Legacy fallbacks: ADMIN ≈ Academy Admin, INSTRUCTOR ≈ Course Developer,
  // STUDENT ≈ Learner. These rows can be re-saved through the dialog to
  // commit the canonical role to the new schema.
  if (user.role === "ADMIN") return "ACADEMY_ADMIN"
  if (user.role === "INSTRUCTOR") return "COURSE_DEVELOPER"
  return "LEARNER"
}

function toApiPayload(role: UnifiedRole, academyId: string) {
  // Platform-scoped roles have no academy membership. Tenant-scoped roles
  // wipe the platform role and set a single membership of the chosen kind.
  if (role === "PLATFORM_OWNER" || role === "PLATFORM_SUPPORT") {
    return {
      platformRole: role,
      academyMemberships: [],
    }
  }
  return {
    platformRole: "NONE" as const,
    academyMemberships: [{ academyId, role }],
  }
}

export function UsersTable({
  users: initialUsers,
  academies,
  canEditRoles,
  currentUserId,
}: {
  users: User[]
  academies: Academy[]
  canEditRoles: boolean
  currentUserId: string
}) {
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [editing, setEditing] = useState<User | null>(null)
  const [draftRole, setDraftRole] = useState<UnifiedRole>("LEARNER")
  const [saving, setSaving] = useState(false)

  function openEdit(user: User) {
    setEditing(user)
    setDraftRole(deriveUnifiedRole(user))
  }

  async function save() {
    if (!editing) return
    setSaving(true)
    try {
      const academyId =
        editing.academyMemberships[0]?.academyId ?? academies[0]?.id ?? ""
      const payload = toApiPayload(draftRole, academyId)

      const res = await fetch(`/api/platform/users/${editing.id}/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Failed to update roles")
        return
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editing.id
            ? {
                ...u,
                platformRole: data.user.platformRole,
                academyMemberships: data.user.academyMemberships,
              }
            : u
        )
      )
      toast.success("Roles updated")
      setEditing(null)
    } catch {
      toast.error("Network error — please retry")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Courses</TableHead>
              <TableHead>Enrollments</TableHead>
              <TableHead>Joined</TableHead>
              {canEditRoles && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const role = deriveUnifiedRole(user)
              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={user.image || ""} />
                        <AvatarFallback>
                          {user.name?.[0] || user.email[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{user.name || "No name"}</p>
                        <p className="text-sm text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={ROLE_STYLES[role]}>
                      {ROLE_LABELS[role]}
                    </Badge>
                  </TableCell>
                  <TableCell>{user._count.courses}</TableCell>
                  <TableCell>{user._count.enrollments}</TableCell>
                  <TableCell>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>
                  {canEditRoles && (
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(user)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        Edit roles
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit roles</DialogTitle>
            <DialogDescription>
              {editing?.name ?? editing?.email}
              {editing?.id === currentUserId && (
                <span className="ml-1 text-xs">(you)</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <label className="text-sm font-medium">Role</label>
            <Select
              value={draftRole}
              onValueChange={(v) => setDraftRole(v as UnifiedRole)}
              disabled={saving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIFIED_ROLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
