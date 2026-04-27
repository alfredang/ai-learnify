import { redirect } from "next/navigation"

// Payments removed per scope change. Cart is no longer in use; redirect
// any deep-link to the learner's enrolled courses.
export default function CartRedirect() {
  redirect("/my-courses")
}
