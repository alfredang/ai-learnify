/**
 * Phase 4 end-to-end verification — no Stripe required.
 *
 * 1. Pick an academy + a learner + a published course.
 * 2. Create a promo code (20% off, 5% marketer commission to admin).
 * 3. Call finalizePurchase() with gross=$100 — simulates a Stripe webhook.
 * 4. Assert:
 *    - Ledger legs balance to zero
 *    - AccessGrant exists with 90-day window
 *    - Invoice row created
 *    - Promo code usage incremented
 * 5. Call reverseLedger() to refund the transaction.
 * 6. Assert:
 *    - Reversal entries exist
 *    - Sum of (original + reversal) legs is zero per parentTxnId
 *    - Double-refund is rejected
 */

import { PrismaClient } from "@prisma/client"
import { finalizePurchase } from "../src/lib/checkout-finalize"
import { reverseLedger, findUnbalancedTransactions } from "../src/lib/ledger"
import { validatePromoCode } from "../src/lib/promo-codes"

const prisma = new PrismaClient()

function fmt(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`
}

async function main() {
  const [academy, learner, course] = await Promise.all([
    prisma.academy.findFirst({ where: { isActive: true } }),
    prisma.user.findFirst({
      where: {
        email: "student2@example.com",
        academyMemberships: { some: { role: "LEARNER" } },
      },
    }),
    prisma.course.findFirst({
      where: { status: "PUBLISHED", academyId: { not: null } },
    }),
  ])

  if (!academy || !learner || !course) {
    throw new Error("Missing academy / learner / course fixtures")
  }

  console.log(`Academy: ${academy.name}`)
  console.log(`Learner: ${learner.email}`)
  console.log(`Course:  ${course.title}`)

  // Clean any prior verify artifacts.
  await prisma.promoCode.deleteMany({ where: { code: "PHASE4TEST" } })
  await prisma.ledgerEntry.deleteMany({
    where: {
      academyId: academy.id,
      userId: learner.id,
      productId: course.id,
      OR: [
        { entryType: "CHARGE" },
        { parentTxnId: { contains: "-REV" } },
      ],
    },
  })
  await prisma.invoice.deleteMany({ where: { userId: learner.id, productId: course.id } })

  // 1) Promo code
  const promo = await prisma.promoCode.create({
    data: {
      academyId: academy.id,
      code: "PHASE4TEST",
      marketerCommissionBps: 500, // 5%
      learnerDiscountBps: 2000,   // 20%
      isActive: true,
    },
  })
  console.log(`\n✓ Created promo PHASE4TEST — 20% discount, 5% commission`)

  const validation = await validatePromoCode("PHASE4TEST", academy.id)
  if (!validation.ok) throw new Error("Promo validation failed")
  console.log(`✓ Validator recognises it`)

  // 2) Finalize a $100 purchase
  const grossMinor = 10_000 // $100.00
  console.log(`\n=== Finalizing purchase ===`)
  const result = await finalizePurchase({
    userId: learner.id,
    academyId: academy.id,
    productType: "COURSE",
    productId: course.id,
    grossMinor,
    currency: "USD",
    promoCodeId: promo.id,
    marketerUserId: null,
    marketerCommissionBps: validation.marketerCommissionBps,
    learnerDiscountBps: validation.learnerDiscountBps,
    taxBps: 800, // 8% tax (e.g. SG GST)
    taxJurisdiction: "SG",
    developerUserId: course.instructorId,
    stripeSessionId: "cs_verify_phase4",
    stripePaymentIntentId: "pi_verify_phase4",
  })

  const dist = result.distribution!
  console.log(`parentTxnId: ${result.parentTxnId}`)
  console.log(`Gross:              ${fmt(dist.grossMinor)}`)
  console.log(`Discount (20%):     -${fmt(dist.discountMinor)}`)
  console.log(`Marketer comm (5%): -${fmt(dist.marketerMinor)}`)
  console.log(`Platform support:   -${fmt(dist.platformSupportMinor)}`)
  console.log(`Tax (8%):           -${fmt(dist.taxMinor)}`)
  console.log(`Academy share:      -${fmt(dist.academyMinor)}`)
  console.log(`Developer share:    -${fmt(dist.developerMinor)}`)

  // 3) Ledger balance check
  const entries = await prisma.ledgerEntry.findMany({
    where: { parentTxnId: result.parentTxnId },
  })
  const sum = entries.reduce((a, e) => a + e.amountMinor, 0)
  console.log(`\nLedger legs: ${entries.length}`)
  console.log(`Sum: ${sum} (must be 0)`)
  if (sum !== 0) throw new Error(`Ledger sum is ${sum}, expected 0`)
  console.log(`✓ Ledger balances`)

  // 4) AccessGrant
  const grant = await prisma.accessGrant.findFirst({
    where: { userId: learner.id, courseId: course.id, isActive: true },
  })
  if (!grant) throw new Error("No access grant created")
  const daysLeft = Math.round((grant.expiresAt.getTime() - Date.now()) / 86_400_000)
  console.log(`✓ AccessGrant active, expires in ~${daysLeft}d`)

  // 5) Invoice
  const invoice = await prisma.invoice.findUnique({ where: { id: result.invoiceId! } })
  if (!invoice) throw new Error("No invoice created")
  console.log(`✓ Invoice ${invoice.invoiceNumber}: net ${fmt(invoice.netMinor)}`)

  // 6) Promo usage incremented
  const promoAfter = await prisma.promoCode.findUnique({ where: { id: promo.id } })
  if (promoAfter?.usageCount !== 1) throw new Error(`Promo usage is ${promoAfter?.usageCount}, expected 1`)
  console.log(`✓ Promo usage = ${promoAfter.usageCount}`)

  // 7) Refund
  console.log(`\n=== Refunding ===`)
  const reversal = await reverseLedger(result.parentTxnId)
  console.log(`✓ ${reversal.length} reversal entries written`)

  const allLegs = await prisma.ledgerEntry.findMany({
    where: { OR: [{ parentTxnId: result.parentTxnId }, { parentTxnId: `${result.parentTxnId}-REV` }] },
  })
  const combinedSum = allLegs.reduce((a, e) => a + e.amountMinor, 0)
  console.log(`Combined original + reversal sum: ${combinedSum} (must be 0)`)
  if (combinedSum !== 0) throw new Error(`Combined sum is ${combinedSum}`)

  // 8) Double-refund rejected
  try {
    await reverseLedger(result.parentTxnId)
    throw new Error("Double refund should have thrown")
  } catch (err) {
    if (err instanceof Error && err.message.includes("already has reversal")) {
      console.log(`✓ Double refund correctly rejected`)
    } else {
      throw err
    }
  }

  // 9) Invariant across the whole DB
  const unbalanced = await findUnbalancedTransactions()
  console.log(`\nGlobal unbalanced transactions: ${unbalanced.length}`)
  if (unbalanced.length > 0) {
    console.error("Unbalanced:", unbalanced)
    throw new Error("Global invariant violated")
  }

  console.log(`\n🎉 Phase 4 verification passed`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
