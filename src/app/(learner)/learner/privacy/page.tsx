import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, ShieldOff, FileText } from "lucide-react"
import { DeactivateAccountForm } from "./deactivate-form"

/**
 * Spec §18 Security & Privacy — learner-facing data export + deactivation.
 */
export default async function LearnerPrivacyPage() {
  const session = await auth()
  if (!session?.user) return null

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      isActive: true,
      _count: {
        select: {
          certificates: { where: { revokedAt: null } },
          accessGrants: true,
          purchases: true,
        },
      },
    },
  })
  if (!user) return null

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Privacy & data</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Spec §18 compliance. Download everything we hold about you, or
          deactivate your account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Your data on Learnify
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row label="Email" value={user.email} />
          <Row
            label="Certificates"
            value={String(user._count.certificates)}
          />
          <Row label="Enrolments" value={String(user._count.accessGrants)} />
          <Row label="Purchases" value={String(user._count.purchases)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" /> Download your data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            A JSON file containing your profile, memberships, course access,
            progress, certificates, purchases, invoices, and the audit events
            we logged for you. Payment instruments and session cookies are
            never stored, so they cannot be exported.
          </p>
          <Button asChild>
            <a href="/api/profile/export" download>
              <Download className="h-4 w-4 mr-2" />
              Download JSON export
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldOff className="h-4 w-4 text-destructive" /> Deactivate
            account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-200 text-xs">
            <p className="font-semibold mb-1">What happens when you deactivate</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>You can no longer sign in.</li>
              <li>
                Your certificates, invoices, and purchase history are preserved
                (spec §17 — records retained indefinitely).
              </li>
              <li>Your public reviews remain visible with your display name.</li>
              <li>
                Re-activation requires contacting platform support — there is
                no self-serve route back in.
              </li>
            </ul>
          </div>
          <DeactivateAccountForm
            email={user.email}
            alreadyDeactivated={!user.isActive}
          />
          <p className="text-xs text-muted-foreground pt-2">
            Have more questions?{" "}
            <Link href="/contact" className="underline hover:text-foreground">
              Contact us
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
