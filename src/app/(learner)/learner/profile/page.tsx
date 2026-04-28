import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { IdentityForm } from "./identity-form"
import { ResetPasswordForm } from "./reset-password-form"
import { EmailForm } from "./email-form"
import { UsernameForm } from "./username-form"

export default async function LearnerProfilePage() {
  const session = await auth()
  if (!session?.user) return null

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      username: true,
      nameToBeCalled: true,
      certificateName: true,
      certificateIdNumber: true,
      password: true,
      createdAt: true,
      platformRole: true,
      academyMemberships: {
        select: { role: true, academy: { select: { name: true } } },
      },
      _count: {
        select: {
          certificates: { where: { revokedAt: null } },
          accessGrants: { where: { isActive: true } },
        },
      },
    },
  })

  if (!user) return null

  const hasPassword = !!user.password
  const isLearnerOnly =
    user.platformRole === "NONE" &&
    user.academyMemberships.length > 0 &&
    user.academyMemberships.every((m) => m.role === "LEARNER")

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Spec §3.1 identity. These values are printed on every certificate you
          earn — edit them carefully.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent>
          <IdentityForm
            initial={{
              name: user.name,
              nameToBeCalled: user.nameToBeCalled,
              certificateName: user.certificateName,
              certificateIdNumber: user.certificateIdNumber,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {hasPassword ? (
            <EmailForm currentEmail={user.email} />
          ) : (
            <Field label="Email" value={user.email} />
          )}
          <Field
            label="Member since"
            value={new Date(user.createdAt).toLocaleDateString()}
          />
          <Field
            label="Active enrolments"
            value={String(user._count.accessGrants)}
          />
          <Field
            label="Certificates earned"
            value={String(user._count.certificates)}
          />
          <ResetPasswordForm />
        </CardContent>
      </Card>

      {!isLearnerOnly && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Username</CardTitle>
          </CardHeader>
          <CardContent>
            <UsernameForm initial={user.username} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {user.platformRole !== "NONE" && (
            <div className="flex items-center justify-between">
              <span>Platform</span>
              <Badge>{user.platformRole.replace("_", " ")}</Badge>
            </div>
          )}
          {user.academyMemberships.length === 0 ? (
            <div className="text-muted-foreground">No academy memberships.</div>
          ) : (
            user.academyMemberships.map((m, i) => (
              <div key={i} className="flex items-center justify-between">
                <span>{m.academy.name}</span>
                <Badge variant="outline">{m.role.replace("_", " ")}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}
