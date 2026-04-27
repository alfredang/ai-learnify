import { redirect } from "next/navigation"

// Spec §5.2 — Invoices & Receipts tab. Lives at the legacy
// /account/purchases path; this stub redirects so /learner/invoices
// (the URL the spec implies) also resolves.
export default function LearnerInvoicesRedirect() {
  redirect("/account/purchases")
}
