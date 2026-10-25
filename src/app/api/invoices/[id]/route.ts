import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { renderInvoiceHtml } from "@/lib/invoice-html"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const { id } = await params

  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Try new Invoice row first (Phase 4). Fall back to legacy Purchase row so
  // any existing links keep working.
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      academy: {
        select: { name: true, primaryCurrency: true, taxJurisdiction: true },
      },
    },
  })

  if (invoice) {
    const isLearner = invoice.userId === session.user.id
    const isOwner = session.user.platformRole === "PLATFORM_OWNER"
    const isAcademyAdmin = session.user.memberships?.some(
      (m) => m.academyId === invoice.academyId && m.role === "ACADEMY_ADMIN"
    )
    if (!isLearner && !isOwner && !isAcademyAdmin) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 })
    }

    let productName = "Purchase"
    if (invoice.productType === "COURSE") {
      const c = await prisma.course.findUnique({
        where: { id: invoice.productId },
        select: { title: true },
      })
      productName = c?.title ?? productName
    } else if (invoice.productType === "PROGRAMME") {
      const p = await prisma.programme.findUnique({
        where: { id: invoice.productId },
        select: { title: true },
      })
      productName = p?.title ?? productName
    }

    const html = renderInvoiceHtml({
      ...invoice,
      academy: invoice.academy,
      productName,
      breakdown: null,
    })
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
  }

  // ---- Legacy Purchase fallback ----
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true } },
      course: {
        select: {
          title: true,
          academyId: true,
          instructor: { select: { name: true } },
        },
      },
    },
  })

  if (!purchase) {
    return NextResponse.json({ message: "Invoice not found" }, { status: 404 })
  }

  if (purchase.userId !== session.user.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 })
  }

  const academy = purchase.course.academyId
    ? await prisma.academy.findUnique({
        where: { id: purchase.course.academyId },
        select: { name: true, primaryCurrency: true, taxJurisdiction: true },
      })
    : null

  const grossMinor = purchase.amount
  const html = renderInvoiceHtml({
    id: purchase.id,
    invoiceNumber: `INV-LEGACY-${purchase.id.slice(0, 8).toUpperCase()}`,
    academyId: purchase.course.academyId ?? "",
    userId: purchase.userId,
    purchaseId: purchase.id,
    productType: "COURSE",
    productId: purchase.courseId,
    grossMinor,
    discountMinor: 0,
    taxMinor: 0,
    netMinor: grossMinor,
    currency: "USD",
    taxJurisdiction: null,
    issuedAt: purchase.createdAt,
    recipientName: purchase.user.name,
    recipientEmail: purchase.user.email,
    academy: academy ?? { name: "Learnify", primaryCurrency: "USD", taxJurisdiction: null },
    productName: purchase.course.title,
    breakdown: null,
  })

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
}
