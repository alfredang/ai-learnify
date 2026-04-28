import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { validateImageUrl, explainImageUrlReason } from "@/lib/image-hosts"

const HTML_FIELDS = [
  "aboutHtml",
  "helpCenterHtml",
  "contactHtml",
  "careersHtml",
  "becomeDeveloperHtml",
  "coursesIntroHtml",
  "categoriesIntroHtml",
] as const

const PLAIN_FIELDS = ["contactEmail", "contactPhone", "contactAddress"] as const

const IMAGE_FIELDS = [
  "aboutHeroImageUrl",
  "aboutStoryImageUrl",
  "becomeDeveloperHeroImageUrl",
] as const

const ALL_FIELDS = [
  ...HTML_FIELDS,
  ...PLAIN_FIELDS,
  ...IMAGE_FIELDS,
  "aboutTeamJson",
  "faqJson",
] as const

type TeamMember = { name: string; role: string; imageUrl: string }
type FaqItem = { q: string; a: string }

function isTeamArray(v: unknown): v is TeamMember[] {
  return (
    Array.isArray(v) &&
    v.every(
      (m) =>
        m &&
        typeof m === "object" &&
        typeof (m as TeamMember).name === "string" &&
        typeof (m as TeamMember).role === "string" &&
        typeof (m as TeamMember).imageUrl === "string"
    )
  )
}

function isFaqArray(v: unknown): v is FaqItem[] {
  return (
    Array.isArray(v) &&
    v.every(
      (m) =>
        m &&
        typeof m === "object" &&
        typeof (m as FaqItem).q === "string" &&
        typeof (m as FaqItem).a === "string"
    )
  )
}

async function resolveAcademyId(session: {
  user: {
    id: string
    platformRole?: string
    memberships?: { academyId: string; role: string }[]
  }
}) {
  const membership = session.user.memberships?.find(
    (m) => m.role === "ACADEMY_ADMIN"
  )
  if (membership) return membership.academyId
  if (session.user.platformRole === "PLATFORM_OWNER") {
    const a = await prisma.academy.findFirst({
      where: { isActive: true },
      select: { id: true },
    })
    return a?.id ?? null
  }
  return null
}

export async function GET() {
  const session = await auth()
  if (!session?.user)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAcademyId(session)
  if (!academyId)
    return NextResponse.json({ message: "No academy found" }, { status: 404 })

  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: Object.fromEntries(ALL_FIELDS.map((f) => [f, true])),
  })

  return NextResponse.json({ data: academy })
}

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

  const isAdmin = session.user.memberships?.some(
    (m) => m.role === "ACADEMY_ADMIN"
  )
  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  if (!isAdmin && !isOwner)
    return NextResponse.json({ message: "Forbidden" }, { status: 403 })

  const academyId = await resolveAcademyId(session)
  if (!academyId)
    return NextResponse.json({ message: "No academy found" }, { status: 404 })

  const body = (await request.json()) as Record<string, unknown>
  const data: Record<string, unknown> = {}
  const updated: string[] = []

  for (const field of HTML_FIELDS) {
    if (field in body) {
      const v = body[field]
      if (v === null || v === "") {
        data[field] = null
      } else if (typeof v === "string") {
        data[field] = v
      } else {
        return NextResponse.json(
          { message: `${field} must be a string or null` },
          { status: 400 }
        )
      }
      updated.push(field)
    }
  }

  for (const field of PLAIN_FIELDS) {
    if (field in body) {
      const v = body[field]
      if (v === null || v === "") {
        data[field] = null
      } else if (typeof v === "string") {
        data[field] = v.trim()
      } else {
        return NextResponse.json(
          { message: `${field} must be a string or null` },
          { status: 400 }
        )
      }
      updated.push(field)
    }
  }

  for (const field of IMAGE_FIELDS) {
    if (field in body) {
      const v = body[field]
      if (v === null || v === "") {
        data[field] = null
      } else if (typeof v === "string") {
        const r = validateImageUrl(v)
        if (!r.ok) {
          return NextResponse.json(
            { message: `${field}: ${explainImageUrlReason(r.reason)}` },
            { status: 400 }
          )
        }
        data[field] = r.url
      } else {
        return NextResponse.json(
          { message: `${field} must be a URL string or null` },
          { status: 400 }
        )
      }
      updated.push(field)
    }
  }

  if ("aboutTeamJson" in body) {
    const v = body.aboutTeamJson
    if (v === null) {
      data.aboutTeamJson = null
    } else if (isTeamArray(v)) {
      for (const m of v) {
        if (m.imageUrl) {
          const r = validateImageUrl(m.imageUrl)
          if (!r.ok) {
            return NextResponse.json(
              {
                message: `Team member "${m.name}": ${explainImageUrlReason(r.reason)}`,
              },
              { status: 400 }
            )
          }
        }
      }
      data.aboutTeamJson = v
    } else {
      return NextResponse.json(
        { message: "aboutTeamJson must be an array of { name, role, imageUrl }" },
        { status: 400 }
      )
    }
    updated.push("aboutTeamJson")
  }

  if ("faqJson" in body) {
    const v = body.faqJson
    if (v === null) {
      data.faqJson = null
    } else if (isFaqArray(v)) {
      data.faqJson = v
    } else {
      return NextResponse.json(
        { message: "faqJson must be an array of { q, a }" },
        { status: 400 }
      )
    }
    updated.push("faqJson")
  }

  if (updated.length === 0) {
    return NextResponse.json(
      { message: "No valid fields to update" },
      { status: 400 }
    )
  }

  await prisma.academy.update({ where: { id: academyId }, data })

  await audit({
    action: "academy.pages.update",
    resourceType: "academy",
    resourceId: academyId,
    userId: session.user.id,
    academyId,
    metadata: { updatedFields: updated },
  })

  return NextResponse.json({ data: { success: true, updated } })
}
