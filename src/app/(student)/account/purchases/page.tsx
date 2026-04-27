import { redirect } from "next/navigation"

// Payments removed per scope change. Purchases tab is hidden; redirect
// to the learner's account home.
export default function PurchasesRedirect() {
  redirect("/account")
}
