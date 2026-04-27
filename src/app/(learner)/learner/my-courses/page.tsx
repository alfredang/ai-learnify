import { redirect } from "next/navigation"

// Spec §5.2 — see /learner/certificates for context. My Courses lives at
// the legacy /my-courses path.
export default function LearnerMyCoursesRedirect() {
  redirect("/my-courses")
}
