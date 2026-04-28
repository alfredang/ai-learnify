import { nanoid } from "nanoid"
import { Prisma, type ProductType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { computeLegs, writeLedger, type PurchaseInput } from "@/lib/ledger"
import { grantCourseAccess, grantProgrammeAccess } from "@/lib/access"
import { consumePromoCode } from "@/lib/promo-codes"
import { audit } from "@/lib/audit"
import { sendEmail } from "@/lib/email"
import { renderInvoiceHtml } from "@/lib/invoice-html"

export type FinalizeInput = {
  userId: string
  academyId: string
  productType: ProductType
  productId: string
  grossMinor: number
  currency: string
  promoCodeId?: string | null
  marketerUserId?: string | null
  marketerCommissionBps?: number
  learnerDiscountBps?: number
  taxBps?: number
  taxJurisdiction?: string
  developerUserId: string
  /** Optional Stripe session id for audit trail */
  stripeSessionId?: string | null
  stripePaymentIntentId?: string | null
}

/**
 * The single source of truth for "a purchase just completed, make it real".
 * Used by the Stripe webhook (paid flow) and by the free-course path in
 * /api/checkout (gross=0 → all ledger legs are 0 but we still write them
 * for audit). Idempotent by stripePaymentIntentId; safe to re-run.
 *
 * Atomic: AccessGrant, LedgerEntry rows, Invoice row, PromoCode usage
 * increment, legacy Enrollment+Purchase rows all commit together or not at
 * all. Course.totalStudents is bumped inside the same tx.
 */
export async function finalizePurchase(input: FinalizeInput) {
  // Idempotency — if we already have a ledger entry for this payment intent,
  // bail early.
  if (input.stripePaymentIntentId) {
    const existing = await prisma.ledgerEntry.findFirst({
      where: {
        metadata: { path: ["stripePaymentIntentId"], equals: input.stripePaymentIntentId },
      },
      select: { parentTxnId: true },
    })
    if (existing) {
      return { alreadyFinalized: true, parentTxnId: existing.parentTxnId }
    }
  }

  const settings = await prisma.platformSettings.findFirst()
  const platformSupportFixed = settings?.platformSupportFixedFeeMinor ?? 50

  const dist = computeLegs({
    academyId: input.academyId,
    productType: input.productType,
    productId: input.productId,
    userId: input.userId,
    grossMinor: input.grossMinor,
    currency: input.currency,
    marketerCommissionBps: input.marketerCommissionBps ?? 0,
    learnerDiscountBps: input.learnerDiscountBps ?? 0,
    marketerUserId: input.marketerUserId ?? null,
    developerUserId: input.developerUserId,
    taxBps: input.taxBps ?? 0,
    taxJurisdiction: input.taxJurisdiction,
    platformSupportFixedFeeMinor: platformSupportFixed,
  })

  const result = await prisma.$transaction(async (tx) => {
    const purchaseInput: PurchaseInput = {
      academyId: input.academyId,
      productType: input.productType,
      productId: input.productId,
      userId: input.userId,
      grossMinor: input.grossMinor,
      currency: input.currency,
      marketerCommissionBps: input.marketerCommissionBps,
      learnerDiscountBps: input.learnerDiscountBps,
      marketerUserId: input.marketerUserId,
      developerUserId: input.developerUserId,
      taxBps: input.taxBps,
      platformSupportFixedFeeMinor: platformSupportFixed,
      promoCodeId: input.promoCodeId ?? null,
    }

    // 1. Write ledger legs.
    const entries = await writeLedger(purchaseInput, dist, tx)

    // Stamp the CHARGE leg with Stripe ids so we can detect duplicates on retry.
    if (input.stripeSessionId || input.stripePaymentIntentId) {
      const chargeLeg = entries.find((e) => e.entryType === "CHARGE")
      if (chargeLeg) {
        await tx.ledgerEntry.update({
          where: { id: chargeLeg.id },
          data: {
            metadata: {
              stripeSessionId: input.stripeSessionId ?? null,
              stripePaymentIntentId: input.stripePaymentIntentId ?? null,
            },
          },
        })
      }
    }

    // 2. Grant access.
    if (input.productType === "COURSE") {
      await grantCourseAccess(input.userId, input.productId, { source: "PURCHASE" })
    } else if (input.productType === "PROGRAMME") {
      await grantProgrammeAccess(input.userId, input.productId, { source: "PURCHASE" })
    }

    // 3. Create invoice.
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { email: true, certificateName: true, nameToBeCalled: true, name: true },
    })
    const invoiceNumber = `INV-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        academyId: input.academyId,
        userId: input.userId,
        productType: input.productType,
        productId: input.productId,
        grossMinor: dist.grossMinor,
        discountMinor: dist.discountMinor,
        taxMinor: dist.taxMinor,
        netMinor: dist.grossMinor - dist.discountMinor,
        currency: input.currency,
        taxJurisdiction: input.taxJurisdiction,
        recipientName: user?.certificateName ?? user?.nameToBeCalled ?? user?.name ?? null,
        recipientEmail: user?.email ?? null,
      },
    })

    // 4. Consume promo code.
    if (input.promoCodeId) {
      // consumePromoCode uses the outer prisma client; inline here so it
      // participates in the transaction.
      await tx.promoCode.update({
        where: { id: input.promoCodeId },
        data: { usageCount: { increment: 1 } },
      })
    }

    // 5. Legacy rows for back-compat (existing UI reads these).
    if (input.productType === "COURSE") {
      await tx.enrollment.upsert({
        where: { userId_courseId: { userId: input.userId, courseId: input.productId } },
        create: { userId: input.userId, courseId: input.productId },
        update: {},
      })
      await tx.course.update({
        where: { id: input.productId },
        data: { totalStudents: { increment: 1 } },
      })
      await tx.cartItem.deleteMany({
        where: { userId: input.userId, courseId: input.productId },
      })
    }
    if (input.stripePaymentIntentId) {
      const existingPurchase = await tx.purchase.findUnique({
        where: { stripePaymentIntentId: input.stripePaymentIntentId },
      })
      if (!existingPurchase && input.productType === "COURSE") {
        await tx.purchase.create({
          data: {
            userId: input.userId,
            courseId: input.productId,
            amount: dist.grossMinor,
            platformFee: dist.platformSupportMinor + dist.academyMinor,
            instructorEarning: dist.developerMinor,
            stripeSessionId: input.stripeSessionId,
            stripePaymentIntentId: input.stripePaymentIntentId,
            status: "COMPLETED",
            courseName:
              (await tx.course.findUnique({ where: { id: input.productId }, select: { title: true } }))
                ?.title ?? "",
            coursePrice: new Prisma.Decimal(dist.grossMinor / 100),
          },
        })
      }
    }

    return { entries, invoice, distribution: dist }
  })

  await audit({
    action: "purchase.finalize",
    resourceType: "ledger",
    resourceId: dist.parentTxnId,
    userId: input.userId,
    academyId: input.academyId,
    metadata: {
      productType: input.productType,
      productId: input.productId,
      grossMinor: dist.grossMinor,
      discountMinor: dist.discountMinor,
      marketerMinor: dist.marketerMinor,
      academyMinor: dist.academyMinor,
      developerMinor: dist.developerMinor,
    },
  })

  // Spec §10.2 — invoice emailed to learner on successful payment.
  // Fire-and-forget: email failure must not roll back the purchase. The
  // email helper audits every attempt so ops can see what didn't send.
  if (result.invoice.recipientEmail) {
    const academy = await prisma.academy.findUnique({
      where: { id: input.academyId },
      select: { name: true, primaryCurrency: true, taxJurisdiction: true },
    })
    const productName =
      input.productType === "COURSE"
        ? (
            await prisma.course.findUnique({
              where: { id: input.productId },
              select: { title: true },
            })
          )?.title ?? "Course"
        : (
            await prisma.programme.findUnique({
              where: { id: input.productId },
              select: { title: true },
            })
          )?.title ?? "Programme"

    const invoiceHtml = renderInvoiceHtml({
      ...result.invoice,
      academy: {
        name: academy?.name ?? "IES Digital Academy",
        primaryCurrency: academy?.primaryCurrency ?? input.currency,
        taxJurisdiction: academy?.taxJurisdiction ?? null,
      },
      productName,
      breakdown: {
        marketerMinor: dist.marketerMinor,
        platformSupportMinor: dist.platformSupportMinor,
        academyMinor: dist.academyMinor,
        developerMinor: dist.developerMinor,
      },
    })

    // Best-effort send. Swallow failures — caller's Stripe webhook has
    // already returned 200; we never want email infra to trigger a retry.
    void sendEmail({
      to: result.invoice.recipientEmail,
      subject: `Invoice ${result.invoice.invoiceNumber} · ${productName}`,
      html: invoiceHtml,
      purpose: "invoice",
      academyId: input.academyId,
      context: {
        invoiceId: result.invoice.id,
        userId: input.userId,
        academyId: input.academyId,
        productId: input.productId,
      },
    }).catch((err) => {
      console.error("[finalize] invoice email failed", err)
    })
  }

  return {
    alreadyFinalized: false,
    parentTxnId: dist.parentTxnId,
    invoiceId: result.invoice.id,
    invoiceNumber: result.invoice.invoiceNumber,
    distribution: dist,
  }
}
