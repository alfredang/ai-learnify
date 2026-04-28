import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { profileSchema } from "@/lib/validations/user"
import { audit, getRequestIp } from "@/lib/audit"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        headline: true,
        bio: true,
        website: true,
        twitter: true,
        linkedin: true,
        youtube: true,
        // Phase 8 — Spec §3.1 identity
        nameToBeCalled: true,
        certificateName: true,
        certificateIdNumber: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json(user)
  } catch (error) {
    console.error("Failed to fetch profile:", error)
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const result = profileSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 }
      )
    }

    // Spec §3.2 — username is for non-learners only. Reject the update
    // cleanly if a learner-only account tries to set one.
    let usernamePatch: string | null | undefined = undefined
    if (result.data.username !== undefined) {
      const current = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          platformRole: true,
          academyMemberships: { select: { role: true } },
        },
      })
      const isLearnerOnly =
        current?.platformRole === "NONE" &&
        current.academyMemberships.length > 0 &&
        current.academyMemberships.every((m) => m.role === "LEARNER")
      if (result.data.username) {
        if (isLearnerOnly) {
          return NextResponse.json(
            {
              error:
                "Usernames are for non-learner roles only. Learners sign in with email.",
              code: "USERNAME_NOT_FOR_LEARNERS",
            },
            { status: 403 }
          )
        }
        // Uniqueness check — Prisma will also throw a P2002 but a clean
        // error beats a 500 round-trip.
        const dup = await prisma.user.findFirst({
          where: {
            username: result.data.username,
            NOT: { id: session.user.id },
          },
          select: { id: true },
        })
        if (dup) {
          return NextResponse.json(
            { error: "Username is already taken", code: "USERNAME_TAKEN" },
            { status: 409 }
          )
        }
        usernamePatch = result.data.username
      } else {
        usernamePatch = null
      }
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: result.data.name,
        headline: result.data.headline || null,
        bio: result.data.bio || null,
        website: result.data.website || null,
        twitter: result.data.twitter || null,
        linkedin: result.data.linkedin || null,
        youtube: result.data.youtube || null,
        nameToBeCalled: result.data.nameToBeCalled || null,
        certificateName: result.data.certificateName || null,
        certificateIdNumber: result.data.certificateIdNumber || null,
        ...(usernamePatch !== undefined ? { username: usernamePatch } : {}),
      },
      select: {
        id: true,
        name: true,
        headline: true,
        bio: true,
        website: true,
        twitter: true,
        linkedin: true,
        youtube: true,
        nameToBeCalled: true,
        certificateName: true,
        certificateIdNumber: true,
        username: true,
      },
    })

    await audit({
      action: "user.profile.update",
      resourceType: "user",
      resourceId: session.user.id,
      userId: session.user.id,
      metadata: {
        fields: Object.keys(result.data).filter(
          (k) => result.data[k as keyof typeof result.data] !== undefined
        ),
      },
      ip: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Failed to update profile:", error)
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    )
  }
}
