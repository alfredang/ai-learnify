import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"

const schema = z.object({
  token: z.string().min(1, "Token is required"),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const record = await prisma.emailChangeToken.findUnique({
      where: { token: parsed.data.token },
    })
    if (!record) {
      return NextResponse.json(
        { error: "Invalid or already used token" },
        { status: 400 }
      )
    }
    if (record.expires < new Date()) {
      await prisma.emailChangeToken.delete({ where: { id: record.id } })
      return NextResponse.json(
        { error: "This verification link has expired. Request a new one." },
        { status: 400 }
      )
    }

    const taken = await prisma.user.findFirst({
      where: { email: record.newEmail, NOT: { id: record.userId } },
      select: { id: true },
    })
    if (taken) {
      await prisma.emailChangeToken.delete({ where: { id: record.id } })
      return NextResponse.json(
        { error: "That email is now in use by another account" },
        { status: 409 }
      )
    }

    const previous = await prisma.user.findUnique({
      where: { id: record.userId },
      select: { email: true },
    })

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { email: record.newEmail, emailVerified: new Date() },
      }),
      prisma.emailChangeToken.delete({ where: { id: record.id } }),
    ])

    await audit({
      action: "user.email.changed",
      resourceType: "user",
      resourceId: record.userId,
      userId: record.userId,
      metadata: {
        oldEmail: previous?.email ?? null,
        newEmail: record.newEmail,
      },
      ip: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    })

    return NextResponse.json({
      message: "Email updated. Please sign in again with your new email.",
    })
  } catch (error) {
    console.error("Email change confirm error:", error)
    return NextResponse.json(
      { error: "Failed to confirm email change" },
      { status: 500 }
    )
  }
}
