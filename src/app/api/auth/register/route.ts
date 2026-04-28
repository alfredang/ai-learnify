import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { registerSchema } from "@/lib/validations/auth"
import { audit, getRequestIp } from "@/lib/audit"
import { grantComplimentaryAccess } from "@/lib/access"
import { rateLimitFromRequest } from "@/lib/rate-limit"

const DEFAULT_ACADEMY_SLUG = "default"

export async function POST(request: Request) {
  // Spec §18 — rate-limit registration to slow down email-enumeration +
  // spam-account creation. 10/min per IP.
  const rl = rateLimitFromRequest(request, {
    route: "auth.register",
    limit: 10,
    windowMs: 60_000,
  })
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests — try again shortly." },
      { status: 429, headers: rl.headers }
    )
  }

  try {
    const rawBody = await request.json()

    // Back-compat: instructor-signup-form.tsx and other legacy callers pass
    // a single `name` field. Map it to the new required spec §3.1 fields.
    const body = {
      ...rawBody,
      nameToBeCalled: rawBody.nameToBeCalled || rawBody.name,
      certificateName: rawBody.certificateName || rawBody.name,
    }

    const validatedData = registerSchema.safeParse(body)

    if (!validatedData.success) {
      return NextResponse.json(
        { message: "Invalid input", errors: validatedData.error.issues },
        { status: 400 }
      )
    }

    const {
      nameToBeCalled,
      certificateName,
      certificateIdNumber,
      email,
      password,
    } = validatedData.data

    // Spec section 1 — every new sign-up starts as a Learner. Other roles
    // are granted afterwards by a Platform Owner via /platform/users.
    const role = "STUDENT" as const

    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json(
        { message: "User with this email already exists" },
        { status: 409 }
      )
    }

    const defaultAcademy = await prisma.academy.findUnique({
      where: { slug: DEFAULT_ACADEMY_SLUG },
      select: { id: true },
    })

    const hashedPassword = await bcrypt.hash(password, 12)

    // Keep `name` populated with certificateName so every legacy call site that
    // reads user.name keeps working until the Phase 1e sweep.
    const user = await prisma.user.create({
      data: {
        name: certificateName,
        nameToBeCalled,
        certificateName,
        certificateIdNumber: certificateIdNumber || null,
        email,
        password: hashedPassword,
        role,
        ...(defaultAcademy
          ? {
              academyMemberships: {
                create: {
                  academyId: defaultAcademy.id,
                  role: "LEARNER",
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        nameToBeCalled: true,
        role: true,
      },
    })

    // Spec §6.1 — auto-grant the academy's Complimentary Programme to
    // every newly-registered learner. grantComplimentaryAccess marks the
    // grant with productType=COMPLIMENTARY so the learner dashboard's
    // /learner/complimentary page picks it up, and uses a far-future
    // sentinel for expiresAt so the grant never expires.
    if (defaultAcademy) {
      const complimentary = await prisma.programme.findFirst({
        where: { academyId: defaultAcademy.id, isFree: true, status: "PUBLISHED" },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
      if (complimentary) {
        await grantComplimentaryAccess(user.id, complimentary.id)
      }
    }

    await audit({
      action: "user.register",
      resourceType: "user",
      resourceId: user.id,
      academyId: defaultAcademy?.id,
      metadata: { role, viaOAuth: false },
      ip: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    })

    return NextResponse.json(
      { message: "User created successfully", user },
      { status: 201 }
    )
  } catch (error) {
    console.error("Registration error:", error)
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    )
  }
}
