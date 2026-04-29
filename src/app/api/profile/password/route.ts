import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { audit, getRequestIp } from "@/lib/audit"

const schema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
})

export async function PUT(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { currentPassword, newPassword } = parsed.data

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { password: true },
    })

    if (!user?.password) {
      return NextResponse.json(
        { error: "Account uses OAuth login — password cannot be changed here" },
        { status: 400 }
      )
    }

    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) {
      // Spec §18 — audit failed password attempts so ops can detect
      // credential-stuffing. The audit record never persists the password.
      await audit({
        action: "user.password.change_failed",
        resourceType: "user",
        resourceId: session.user.id,
        userId: session.user.id,
        metadata: { reason: "incorrect_current_password" },
        ip: getRequestIp(req),
        userAgent: req.headers.get("user-agent") ?? undefined,
      })
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 }
      )
    }

    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: session.user.id },
      data: { password: hashed },
    })

    // Spec §18 — successful password change is a high-value security event.
    await audit({
      action: "user.password.change",
      resourceType: "user",
      resourceId: session.user.id,
      userId: session.user.id,
      ip: getRequestIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    })

    return NextResponse.json({ message: "Password updated" })
  } catch (error) {
    console.error("Password change error:", error)
    return NextResponse.json(
      { error: "Failed to update password" },
      { status: 500 }
    )
  }
}
