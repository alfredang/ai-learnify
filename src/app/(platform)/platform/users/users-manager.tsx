"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type PlatformRole = "NONE" | "PLATFORM_OWNER" | "PLATFORM_SUPPORT"
type AcademyRole = "LEARNER" | "COURSE_DEVELOPER" | "ACADEMY_ADMIN" | "MARKETER"

type Membership = {
  academyId: string
  role: AcademyRole
  academy: { id: string; name: string; slug: string }
}

type User = {
  id: string
  email: string
  name: string | null
  image: string | null
  platformRole: PlatformRole
  academyMemberships: Membership[]
}

type Academy = { id: string; name: string; slug: string }

const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  NONE: "None",
  PLATFORM_OWNER: "Platform Owner",
  PLATFORM_SUPPORT: "Platform Support",
}

const ACADEMY_ROLE_LABELS: Record<AcademyRole, string> = {
  LEARNER: "Learner",
  COURSE_DEVELOPER: "Course Developer",
  ACADEMY_ADMIN: "Academy Admin",
  MARKETER: "Marketer / Affiliate",
}

const ACADEMY_ROLE_OPTIONS: AcademyRole[] = [
  "LEARNER",
  "COURSE_DEVELOPER",
  "ACADEMY_ADMIN",
  "MARKETER",
]

export function UsersManager({
  users: initialUsers,
  academies,
  currentUserId,
}: {
  users: User[]
  academies: Academy[]
  currentUserId: string
}) {
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftPlatformRole, setDraftPlatformRole] = useState<PlatformRole>("NONE")
  // For simplicity we treat each user as having at most one membership per
  // academy and edit a single primary academy at a time. The default tenant
  // is selected when present.
  const [draftAcademyRole, setDraftAcademyRole] = useState<AcademyRole | "NONE">("NONE")
  const [draftAcademyId, setDraftAcademyId] = useState<string>(
    academies[0]?.id ?? ""
  )
  const [saving, setSaving] = useState(false)

  function startEdit(user: User) {
    setEditingId(user.id)
    setDraftPlatformRole(user.platformRole)
    const m = user.academyMemberships[0]
    if (m) {
      setDraftAcademyId(m.academyId)
      setDraftAcademyRole(m.role)
    } else {
      setDraftAcademyId(academies[0]?.id ?? "")
      setDraftAcademyRole("NONE")
    }
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function save(userId: string) {
    setSaving(true)
    try {
      const memberships =
        draftAcademyRole === "NONE" || !draftAcademyId
          ? []
          : [{ academyId: draftAcademyId, role: draftAcademyRole }]

      const res = await fetch(`/api/platform/users/${userId}/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformRole: draftPlatformRole,
          academyMemberships: memberships,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Failed to update roles")
        return
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...data.user } : u))
      )
      setEditingId(null)
      toast.success("Roles updated")
    } catch {
      toast.error("Network error — please retry")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {users.map((user) => {
            const isEditing = editingId === user.id
            const isSelf = user.id === currentUserId
            return (
              <div
                key={user.id}
                className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 p-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={user.image ?? undefined} />
                    <AvatarFallback>
                      {user.name?.[0]?.toUpperCase() ??
                        user.email[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {user.name ?? user.email}
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                    {!isEditing && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge
                          variant={
                            user.platformRole === "NONE"
                              ? "outline"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {PLATFORM_ROLE_LABELS[user.platformRole]}
                        </Badge>
                        {user.academyMemberships.map((m) => (
                          <Badge
                            key={m.academyId}
                            variant="outline"
                            className="text-xs"
                          >
                            {ACADEMY_ROLE_LABELS[m.role]} ·{" "}
                            {m.academy.name}
                          </Badge>
                        ))}
                        {user.academyMemberships.length === 0 && (
                          <Badge
                            variant="outline"
                            className="text-xs text-muted-foreground"
                          >
                            No academy membership
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">
                        Platform role
                      </label>
                      <Select
                        value={draftPlatformRole}
                        onValueChange={(v) =>
                          setDraftPlatformRole(v as PlatformRole)
                        }
                        disabled={saving}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            ["NONE", "PLATFORM_OWNER", "PLATFORM_SUPPORT"] as PlatformRole[]
                          ).map((r) => (
                            <SelectItem key={r} value={r}>
                              {PLATFORM_ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">
                        Academy role
                      </label>
                      <Select
                        value={draftAcademyRole}
                        onValueChange={(v) =>
                          setDraftAcademyRole(v as AcademyRole | "NONE")
                        }
                        disabled={saving}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">No membership</SelectItem>
                          {ACADEMY_ROLE_OPTIONS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ACADEMY_ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2 md:ml-2 md:self-end">
                      <Button
                        size="sm"
                        onClick={() => save(user.id)}
                        disabled={saving}
                      >
                        {saving && (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        )}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={cancelEdit}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex md:items-center md:justify-end">
                    <Button size="sm" variant="outline" onClick={() => startEdit(user)}>
                      Edit roles
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export type { User as PlatformUser }
