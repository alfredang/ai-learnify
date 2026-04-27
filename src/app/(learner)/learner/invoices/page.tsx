import { redirect } from "next/navigation"

// Payments removed per scope change. Invoices tab is hidden; redirect
// to the learner's home dashboard.
export default function LearnerInvoicesRedirect() {
  redirect("/learner")
}
