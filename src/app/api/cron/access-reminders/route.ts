import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { sendEmail } from "@/lib/email"

/**
 * Spec §11.2 reminder emails:
 *   - End of Month 1 (~60 days before expiry)
 *   - End of Month 2 (~30 days before expiry)
 *   - 2 weeks before expiry
 *
 * Runs daily. Protected by CRON_SECRET — set it in .env and configure
 * your scheduler (Coolify scheduled task, cron, etc.) to send `Authorization: Bearer $CRON_SECRET`.
 *
 * When RESEND_API_KEY + EMAIL_FROM are configured, email is sent per
 * grant; otherwise the attempt is logged via the audit helper in
 * sendEmail so the pipeline is visible in dev.
 */

type ReminderTag = "M1_END" | "M2_END" | "T_MINUS_14"

const TAG_COPY: Record<ReminderTag, { subject: string; headline: string }> = {
  M1_END: {
    subject: "You have 2 months left on {product}",
    headline: "Month 1 of your access window is done",
  },
  M2_END: {
    subject: "Just 30 days left on {product}",
    headline: "You're entering the last month of your access",
  },
  T_MINUS_14: {
    subject: "14 days left on {product}",
    headline: "Access ends in two weeks",
  },
}

function renderReminderHtml(opts: {
  name: string | null
  productName: string
  daysLeft: number
  tag: ReminderTag
  appUrl: string
}): string {
  const copy = TAG_COPY[opts.tag]
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hi there,"
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a202c;">
  <h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(copy.headline)}</h1>
  <p>${greeting}</p>
  <p>Your access to <b>${escapeHtml(opts.productName)}</b> expires in about
  <b>${opts.daysLeft} days</b>. After that, the content will be locked but your
  progress, certificates, and invoices will remain available indefinitely.</p>
  <p style="margin-top:24px;">
    <a href="${opts.appUrl}/my-courses" style="display:inline-block;padding:10px 20px;background:#6d28d9;color:white;text-decoration:none;border-radius:6px;">Continue learning</a>
  </p>
  <p style="color:#718096;font-size:12px;margin-top:40px;">
    You're receiving this because you enrolled in a Learnify course or programme.
    This reminder is sent automatically per the 90-day access policy (spec §11.1).
  </p>
</body></html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.warn("[cron/access-reminders] CRON_SECRET not set; refusing to run")
    return NextResponse.json({ error: "Not configured" }, { status: 500 })
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const dayMs = 86_400_000
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://learnify.local"

  // Window each reminder within ±12 hours so we don't miss a tick even if
  // the cron fires a little early or late.
  const windows: Array<{ tag: ReminderTag; daysOut: number }> = [
    { tag: "M1_END", daysOut: 60 },
    { tag: "M2_END", daysOut: 30 },
    { tag: "T_MINUS_14", daysOut: 14 },
  ]

  const processed: Record<ReminderTag, number> = {
    M1_END: 0,
    M2_END: 0,
    T_MINUS_14: 0,
  }
  const sent: Record<ReminderTag, number> = {
    M1_END: 0,
    M2_END: 0,
    T_MINUS_14: 0,
  }
  const resendConfigured = Boolean(
    process.env.RESEND_API_KEY && process.env.EMAIL_FROM
  )

  for (const w of windows) {
    const windowStart = new Date(now.getTime() + (w.daysOut - 0.5) * dayMs)
    const windowEnd = new Date(now.getTime() + (w.daysOut + 0.5) * dayMs)

    const grants = await prisma.accessGrant.findMany({
      where: {
        isActive: true,
        expiresAt: { gte: windowStart, lte: windowEnd },
        // Skip Complimentary (no expiry concern per spec §6.1).
        productType: { in: ["COURSE", "PROGRAMME"] },
      },
      include: {
        user: {
          select: { id: true, email: true, nameToBeCalled: true, name: true },
        },
        course: { select: { title: true, academyId: true } },
        programme: { select: { title: true, academyId: true } },
      },
    })

    for (const g of grants) {
      const productName =
        g.course?.title ?? g.programme?.title ?? "your content"
      const academyId =
        g.course?.academyId ?? g.programme?.academyId ?? null
      const daysLeft = Math.round(
        (g.expiresAt.getTime() - now.getTime()) / dayMs
      )

      await audit({
        action: "reminder.enqueue",
        resourceType: "accessGrant",
        resourceId: g.id,
        userId: g.userId,
        ...(academyId ? { academyId } : {}),
        metadata: {
          reminderType: w.tag,
          daysLeft,
          productName,
        },
      })
      processed[w.tag]++

      // sendEmail will use the academy's configured provider when
      // available, else fall back to Resend env vars, else log + skip.
      if (g.user.email) {
        const subject = TAG_COPY[w.tag].subject.replace(
          "{product}",
          productName
        )
        const html = renderReminderHtml({
          name: g.user.nameToBeCalled ?? g.user.name ?? null,
          productName,
          daysLeft,
          tag: w.tag,
          appUrl,
        })
        const purpose =
          w.tag === "M1_END"
            ? "reminder.end_m1"
            : w.tag === "M2_END"
              ? "reminder.end_m2"
              : "reminder.pre_expiry"
        const res = await sendEmail({
          to: g.user.email,
          subject,
          html,
          purpose,
          ...(academyId ? { academyId } : {}),
          context: {
            accessGrantId: g.id,
            userId: g.userId,
            reminderTag: w.tag,
            daysLeft,
          },
        })
        if (res.ok) sent[w.tag]++
      }
    }
  }

  return NextResponse.json({
    processed,
    sent,
    resendFallbackConfigured: resendConfigured,
    note:
      "Each reminder is dispatched via the academy's configured provider " +
      "(Gmail / SMTP) when available, else the platform Resend fallback, " +
      "else logged only. See email.send / email.skip audit entries.",
  })
}
