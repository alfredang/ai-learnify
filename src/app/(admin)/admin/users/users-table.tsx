"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Pencil } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type LegacyRole = "STUDENT" | "INSTRUCTOR" | "ADMIN"
type PlatformRoleValue = "PLATFORM_OWNER" | "PLATFORM_SUPPORT"
type AcademyRole = "LEARNER" | "COURSE_DEVELOPER" | "ACADEMY_ADMIN" | "MARKETER"

// All six roles can be held independently per spec section 1.
type UnifiedRole = PlatformRoleValue | AcademyRole

const UNIFIED_ROLE_OPTIONS: {
  value: UnifiedRole
  label: string
  description: string
}[] = [
  {
    value: "PLATFORM_OWNER",
    label: "Platform Owner",
    description: "Commercial owner, monetisation policy",
  },
  {
    value: "PLATFORM_SUPPORT",
    label: "Platform Support",
    description: "Security, uptime, technical support",
  },
  {
    value: "ACADEMY_ADMIN",
    label: "Academy Admin",
    description: "Organisation / Academy administrator",
  },
  {
    value: "COURSE_DEVELOPER",
    label: "Course Developer",
    description: "Content creation & maintenance",
  },
  {
    value: "MARKETER",
    label: "Marketer / Affiliate",
    description: "Promotion via promo codes",
  },
  {
    value: "LEARNER",
    label: "Learner",
    description: "End-user consumer",
  },
]

const PLATFORM_GROUP: PlatformRoleValue[] = ["PLATFORM_OWNER", "PLATFORM_SUPPORT"]
const ACADEMY_GROUP: AcademyRole[] = [
  "ACADEMY_ADMIN",
  "COURSE_DEVELOPER",
  "MARKETER",
  "LEARNER",
]

function isPlatformRole(r: UnifiedRole): r is PlatformRoleValue {
  return (PLATFORM_GROUP as UnifiedRole[]).includes(r)
}

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
  platformRole: "NONE" | PlatformRoleValue
  platformRoles: PlatformRoleValue[]
  createdAt: string
  academyMemberships: Membership[]
  _count: { courses: number; enrollments: number }
}

type Academy = { id: string; name: string; slug: string }

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

// Every role a user currently holds. platformRoles[] is the canonical
// source for platform roles; academyMemberships hold the rest. Falls
// back to a single legacy-derived role for rows that pre-date the new
// schema.
function deriveUnifiedRoles(user: User): UnifiedRole[] {
  const roles = new Set<UnifiedRole>()
  for (const r of user.platformRoles) roles.add(r)
  // If platformRoles[] is empty but legacy platformRole isn't, surface
  // it so the dialog opens with the right boxes ticked.
  if (
    user.platformRoles.length === 0 &&
    user.platformRole !== "NONE"
  ) {
    roles.add(user.platformRole)
  }
  for (const m of user.academyMemberships) roles.add(m.role)
  if (roles.size > 0) return [...roles]
  // Legacy fallback when neither new field is populated.
  if (user.role === "ADMIN") return ["ACADEMY_ADMIN"]
  if (user.role === "INSTRUCTOR") return ["COURSE_DEVELOPER"]
  return ["LEARNER"]
}

function toApiPayload(roles: UnifiedRole[], academyId: string) {
  const platformRoles = roles.filter(isPlatformRole)
  const academyRoles = roles.filter((r): r is AcademyRole => !isPlatformRole(r))
  return {
    platformRoles,
    academyMemberships:
      academyId && academyRoles.length > 0
        ? academyRoles.map((role) => ({ academyId, role }))
        : [],
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
  const [draftRoles, setDraftRoles] = useState<Set<UnifiedRole>>(new Set())
  const [saving, setSaving] = useState(false)

  function openEdit(user: User) {
    setEditing(user)
    setDraftRoles(new Set(deriveUnifiedRoles(user)))
  }

  // Each role is independent — clicking just toggles that role on or off.
  function toggleRole(role: UnifiedRole) {
    setDraftRoles((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }

  async function save() {
    if (!editing) return
    setSaving(true)
    try {
      const academyId =
        editing.academyMemberships[0]?.academyId ?? academies[0]?.id ?? ""
      const payload = toApiPayload([...draftRoles], academyId)

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
                platformRoles: data.user.platformRoles ?? [],
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
              const roles = deriveUnifiedRoles(user)
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
                    <div className="flex flex-wrap gap-1.5">
                      {roles.map((r) => (
                        <Badge
                          key={r}
                          variant="secondary"
                          className={ROLE_STYLES[r]}
                        >
                          {ROLE_LABELS[r]}
                        </Badge>
                      ))}
                    </div>
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

          <div className="space-y-2 py-2">
            <p className="text-xs text-muted-foreground">
              Tick every role this user holds. Each role is independent.
            </p>
            {UNIFIED_ROLE_OPTIONS.map((o) => (
              <label
                key={o.value}
                className="flex items-start gap-2.5 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50"
              >
                <Checkbox
                  checked={draftRoles.has(o.value)}
                  onCheckedChange={() => toggleRole(o.value)}
                  disabled={saving}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">
                    {o.label}
                  </p>
                  <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                    {o.description}
                  </p>
                </div>
              </label>
            ))}
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
