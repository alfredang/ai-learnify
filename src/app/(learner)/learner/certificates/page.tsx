import { redirect } from "next/navigation"

// Spec §5.2 expects every learner tab under /learner. The certificates
// page lives at the legacy /certificates path; this stub redirects so
// either URL works for users who type into the address bar.
export default function LearnerCertificatesRedirect() {
  redirect("/certificates")
}
