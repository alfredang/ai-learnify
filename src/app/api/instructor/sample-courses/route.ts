import { NextResponse } from "next/server"
import slugify from "slugify"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"
import { loadRoleContext, pickDefaultAcademy } from "@/lib/academy"

type SampleSpec = {
  title: string
  subtitle: string
  description: string
  thumbnail: string
  price: number
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ALL_LEVELS"
  learningOutcomes: string[]
  requirements: string[]
  targetAudience: string[]
  sectionTitle: string
  lectureTitles: string[]
}

const SAMPLES: SampleSpec[] = [
  {
    title: "Foundations of Civil Engineering",
    subtitle: "Core principles every junior civil engineer should master",
    description:
      "<h2>Foundations of Civil Engineering</h2><p>Bridge theory and practice across structures, geotech, hydraulics, and project delivery — designed for early-career engineers and CPD candidates.</p>",
    thumbnail: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800",
    price: 49,
    level: "BEGINNER",
    learningOutcomes: [
      "Apply load-path thinking to common civil structures",
      "Read and interpret basic geotechnical reports",
      "Plan small-scale construction works",
      "Communicate engineering decisions to non-engineers",
    ],
    requirements: ["Basic algebra and physics"],
    targetAudience: ["Junior civil engineers", "EIT / professional review candidates"],
    sectionTitle: "Module 1 — Orientation",
    lectureTitles: ["Welcome", "How this course works", "First case study"],
  },
  {
    title: "Sustainability for the Built Environment",
    subtitle: "Embedding ESG and decarbonisation into project delivery",
    description:
      "<h2>Sustainability for the Built Environment</h2><p>Practical, project-grade decarbonisation: embodied carbon, materials selection, certification schemes, and reporting.</p>",
    thumbnail: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800",
    price: 89,
    level: "INTERMEDIATE",
    learningOutcomes: [
      "Quantify embodied vs operational carbon",
      "Choose lower-impact materials with confidence",
      "Map projects to BCA Green Mark / LEED / BREEAM",
      "Produce auditable sustainability reports",
    ],
    requirements: ["Some construction or design exposure"],
    targetAudience: ["Project engineers", "Sustainability leads", "Owner's reps"],
    sectionTitle: "Module 1 — Carbon basics",
    lectureTitles: ["Why carbon matters", "Operational vs embodied", "Reporting frameworks"],
  },
  {
    title: "Generative AI for Engineers",
    subtitle: "Practical LLM workflows for technical work",
    description:
      "<h2>Generative AI for Engineers</h2><p>Move past chat hype: real LLM patterns for spec review, calculation checking, and document drafting in regulated workflows.</p>",
    thumbnail: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800",
    price: 129,
    level: "INTERMEDIATE",
    learningOutcomes: [
      "Design prompts that survive ambiguity",
      "Use retrieval to ground answers in your docs",
      "Audit AI output against engineering standards",
      "Build a small assistant for your team",
    ],
    requirements: ["No coding required, basic comfort with web tools"],
    targetAudience: ["Practising engineers", "Engineering managers", "Technical writers"],
    sectionTitle: "Module 1 — From chat to workflow",
    lectureTitles: ["The shift in tooling", "Prompt anatomy", "First useful workflow"],
  },
  {
    title: "Project Management for Technical Teams",
    subtitle: "Delivering engineering work on time and on scope",
    description:
      "<h2>Project Management for Technical Teams</h2><p>A no-fluff PM playbook for engineering teams: scope, schedule, risk, and stakeholder management without buzzwords.</p>",
    thumbnail: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800",
    price: 69,
    level: "ALL_LEVELS",
    learningOutcomes: [
      "Define scope without overcommitting",
      "Build schedules engineers actually trust",
      "Run risk reviews that change behaviour",
      "Communicate up and across with confidence",
    ],
    requirements: [],
    targetAudience: ["Tech leads", "New PMs", "Senior engineers stepping up"],
    sectionTitle: "Module 1 — The shape of a project",
    lectureTitles: ["What you're really delivering", "Scope, schedule, cost", "First-week checklist"],
  },
]

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "AUTH_REQUIRED" },
      { status: 401 }
    )
  }

  // Refuse if user already has any course — sample seeding is a one-shot
  // bootstrap for empty developer accounts only.
  const existing = await prisma.course.count({
    where: { instructorId: session.user.id },
  })
  if (existing > 0) {
    return NextResponse.json(
      {
        error: "You already have courses — samples are only for empty accounts.",
        code: "ALREADY_HAS_COURSES",
      },
      { status: 409 }
    )
  }

  // Pick the developer's academy (membership). Without one, samples can't
  // be tied to an academy and the admin queue can't see them.
  const ctx = await loadRoleContext(session.user.id)
  const membership = pickDefaultAcademy(ctx ?? undefined)
  if (!membership) {
    return NextResponse.json(
      {
        error: "You are not a member of any academy yet.",
        code: "NO_ACADEMY_MEMBERSHIP",
      },
      { status: 400 }
    )
  }

  const category = await prisma.category.findFirst({
    orderBy: { name: "asc" },
    select: { id: true },
  })
  if (!category) {
    return NextResponse.json(
      { error: "No categories configured.", code: "NO_CATEGORIES" },
      { status: 500 }
    )
  }

  const created: { id: string; title: string; slug: string }[] = []
  for (const spec of SAMPLES) {
    const baseSlug = slugify(`${spec.title}-${session.user.id.slice(-6)}`, {
      lower: true,
      strict: true,
    })
    let slug = baseSlug
    const dup = await prisma.course.findFirst({
      where: { slug },
      select: { id: true },
    })
    if (dup) slug = `${baseSlug}-${Date.now()}`

    const course = await prisma.course.create({
      data: {
        title: spec.title,
        slug,
        subtitle: spec.subtitle,
        description: spec.description,
        thumbnail: spec.thumbnail,
        price: spec.price,
        level: spec.level,
        learningOutcomes: spec.learningOutcomes,
        requirements: spec.requirements,
        targetAudience: spec.targetAudience,
        status: "DRAFT",
        instructorId: session.user.id,
        categoryId: category.id,
        academyId: membership.academyId,
        sections: {
          create: [
            {
              title: spec.sectionTitle,
              position: 1,
              lectures: {
                create: spec.lectureTitles.map((title, i) => ({
                  title,
                  type: "TEXT" as const,
                  position: i + 1,
                  content: `<p>Replace this placeholder with your real ${title.toLowerCase()} lecture.</p>`,
                })),
              },
            },
          ],
        },
      },
      select: { id: true, title: true, slug: true },
    })
    created.push(course)
  }

  await audit({
    action: "course.sample_seed",
    resourceType: "course",
    userId: session.user.id,
    academyId: membership.academyId,
    metadata: { count: created.length, courseIds: created.map((c) => c.id) },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ courses: created })
}
