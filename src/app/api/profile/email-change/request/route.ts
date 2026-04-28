import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { audit, getRequestIp } from "@/lib/audit"
import { rateLimitFromRequest } from "@/lib/rate-limit"

const schema = z.object({
  newEmail: z.string().email("Invalid email address").max(254),
  currentPassword: z.string().min(1, "Current password is required"),
})

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const limit = rateLimitFromRequest(request, {
      route: "profile.email-change.request",
      limit: 5,
      windowMs: 60 * 60 * 1000,
      identifier: session.user.id,
    })
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many email change requests. Try again later." },
        { status: 429, headers: limit.headers }
      )
    }

    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const newEmail = parsed.data.newEmail.trim().toLowerCase()

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, name: true, password: true },
    })
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }
    if (!user.password) {
      return NextResponse.json(
        { error: "Account uses OAuth login — email cannot be changed here" },
        { status: 400 }
      )
    }
    if (user.email.toLowerCase() === newEmail) {
      return NextResponse.json(
        { error: "New email is the same as your current email" },
        { status: 400 }
      )
    }

    const valid = await bcrypt.compare(parsed.data.currentPassword, user.password)
    if (!valid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 }
      )
    }

    const taken = await prisma.user.findFirst({
      where: { email: newEmail, NOT: { id: user.id } },
      select: { id: true },
    })
    if (taken) {
      return NextResponse.json(
        { error: "That email is already in use" },
        { status: 409 }
      )
    }

    await prisma.emailChangeToken.deleteMany({ where: { userId: user.id } })

    const token = randomBytes(32).toString("hex")
    const expires = new Date(Date.now() + TOKEN_TTL_MS)
    await prisma.emailChangeToken.create({
      data: { userId: user.id, newEmail, token, expires },
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
    const link = `${appUrl}/verify-email-change?token=${token}`
    const displayName = user.name || user.email
    const html = `
      <p>Hi ${escapeHtml(displayName)},</p>
      <p>We received a request to change your IESA Digital Academy account email to <strong>${escapeHtml(newEmail)}</strong>.</p>
      <p>Click the link below to confirm. The link expires in 24 hours.</p>
      <p><a href="${link}">${link}</a></p>
      <p>If you didn't request this, you can ignore this email — your current email will stay active.</p>
    `

    await sendEmail({
      to: newEmail,
      subject: "Confirm your new email address",
      html,
      purpose: "email.change_verification",
      context: { userId: user.id, oldEmail: user.email, newEmail },
    })

    await audit({
      action: "user.email.change_requested",
      resourceType: "user",
      resourceId: user.id,
      userId: user.id,
      metadata: { oldEmail: user.email, newEmail },
      ip: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    })

    return NextResponse.json({
      message: `Verification email sent to ${newEmail}. Check your inbox to confirm the change.`,
    })
  } catch (error) {
    console.error("Email change request error:", error)
    return NextResponse.json(
      { error: "Failed to start email change" },
      { status: 500 }
    )
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
