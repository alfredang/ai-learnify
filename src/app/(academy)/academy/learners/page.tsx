import Link from "next/link"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LearnerRowActions } from "./learner-row-actions"

async function resolveAcademyId(userId: string, platformRole: string) {
  if (platformRole === "PLATFORM_OWNER") {
    const a = await prisma.academy.findFirst({
      where: { isActive: true },
      select: { id: true },
    })
    return a?.id ?? null
  }
  const m = await prisma.academyMembership.findFirst({
    where: { userId, role: "ACADEMY_ADMIN" },
    select: { academyId: true },
  })
  return m?.academyId ?? null
}

type SortKey = "newest" | "oldest" | "most_active" | "most_certs" | "name"
type StatusFilter = "all" | "active" | "deactivated" | "paying" | "free_only"

interface PageProps {
  searchParams: Promise<{
    q?: string
    status?: string
    sort?: string
    page?: string
  }>
}

/**
 * Spec §6 step 5 — learner management with sort/filter for marketing
 * statistics. Filters drive both the prisma query and the URL state so
 * the admin can share a link to a specific slice.
 */
export default async function AcademyLearnersPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) return null

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return null

  const sp = await searchParams
  const q = (sp.q ?? "").trim()
  const status = (sp.status as StatusFilter | undefined) ?? "all"
  const sort = (sp.sort as SortKey | undefined) ?? "newest"
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1)
  const pageSize = 50

  const where: Prisma.AcademyMembershipWhereInput = {
    academyId,
    role: "LEARNER",
    ...(q
      ? {
          user: {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { nameToBeCalled: { contains: q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
    ...(status === "active" && { user: { isActive: true } }),
    ...(status === "deactivated" && { user: { isActive: false } }),
    ...(status === "paying" && {
      user: { purchases: { some: { status: "COMPLETED" } } },
    }),
    ...(status === "free_only" && {
      user: { purchases: { none: { status: "COMPLETED" } } },
    }),
  }

  const orderBy: Prisma.AcademyMembershipOrderByWithRelationInput =
    sort === "oldest"
      ? { createdAt: "asc" }
      : sort === "name"
        ? { user: { name: "asc" } }
        : { createdAt: "desc" }

  const [total, rows, activeLearners, deactivatedLearners, payingLearners] =
    await Promise.all([
      prisma.academyMembership.count({ where }),
      prisma.academyMembership.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              nameToBeCalled: true,
              name: true,
              isActive: true,
              _count: {
                select: {
                  accessGrants: {
                    where: { isActive: true, expiresAt: { gt: new Date() } },
                  },
                  certificates: { where: { revokedAt: null } },
                  purchases: { where: { status: "COMPLETED" } },
                },
              },
            },
          },
        },
      }),
      prisma.academyMembership.count({
        where: { academyId, role: "LEARNER", user: { isActive: true } },
      }),
      prisma.academyMembership.count({
        where: { academyId, role: "LEARNER", user: { isActive: false } },
      }),
      prisma.academyMembership.count({
        where: {
          academyId,
          role: "LEARNER",
          user: { purchases: { some: { status: "COMPLETED" } } },
        },
      }),
    ])

  // Sorts that rely on related counts (most_active, most_certs) require
  // post-query sorting because Prisma doesn't expose orderBy on nested
  // _count across relations.
  let sortedRows = rows
  if (sort === "most_active") {
    sortedRows = [...rows].sort(
      (a, b) => b.user._count.accessGrants - a.user._count.accessGrants
    )
  } else if (sort === "most_certs") {
    sortedRows = [...rows].sort(
      (a, b) => b.user._count.certificates - a.user._count.certificates
    )
  }

  const buildUrl = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams()
    const next = { q, status, sort, page: String(page), ...patch }
    for (const [k, v] of Object.entries(next)) {
      if (v && v !== "" && v !== "all" && !(k === "page" && v === "1")) {
        params.set(k, v)
      }
    }
    const qs = params.toString()
    return qs ? `?${qs}` : "?"
  }

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Learners</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Spec §6 step 5. Filter and sort to slice marketing data; deactivate
          preserves all records (spec §17).
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total" value={total} />
        <Stat label="Active" value={activeLearners} />
        <Stat label="Deactivated" value={deactivatedLearners} />
        <Stat label="Paying" value={payingLearners} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form method="get" className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground">Search</label>
              <input
                name="q"
                defaultValue={q}
                placeholder="Email, name, or name to be called"
                className="w-full h-9 px-3 rounded-md border bg-background text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <select
                name="status"
                defaultValue={status}
                className="h-9 px-3 rounded-md border bg-background text-sm"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="deactivated">Deactivated</option>
                <option value="paying">Paying</option>
                <option value="free_only">Free only</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Sort</label>
              <select
                name="sort"
                defaultValue={sort}
                className="h-9 px-3 rounded-md border bg-background text-sm"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name A–Z</option>
                <option value="most_active">Most active access</option>
                <option value="most_certs">Most certificates</option>
              </select>
            </div>
            <button
              type="submit"
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium"
            >
              Apply
            </button>
            {(q || status !== "all" || sort !== "newest") && (
              <Link
                href="/academy/learners"
                className="h-9 px-4 inline-flex items-center rounded-md border text-sm"
              >
                Reset
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Learner</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Active access</TableHead>
                <TableHead className="text-right">Certs</TableHead>
                <TableHead className="text-right">Paid courses</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-sm text-muted-foreground py-10"
                  >
                    No learners match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                sortedRows.map((m) => (
                  <TableRow key={m.user.id}>
                    <TableCell className="font-medium">
                      {m.user.nameToBeCalled ?? m.user.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.user.email}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.user._count.accessGrants}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.user._count.certificates}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.user._count.purchases}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.user.isActive ? "default" : "outline"}>
                        {m.user.isActive ? "Active" : "Deactivated"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <LearnerRowActions
                        userId={m.user.id}
                        email={m.user.email}
                        isActive={m.user.isActive}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {total > pageSize && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {Math.ceil(total / pageSize)} · {total} total
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildUrl({ page: String(page - 1) })}
                className="px-3 py-1.5 rounded-md border"
              >
                ← Prev
              </Link>
            )}
            {page * pageSize < total && (
              <Link
                href={buildUrl({ page: String(page + 1) })}
                className="px-3 py-1.5 rounded-md border"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  )
}
