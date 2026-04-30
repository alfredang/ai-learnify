# Cloudinary setup

Cloudinary is the LMS's primary media CDN — it hosts course thumbnails and
lecture videos. When configured, it auto-generates video thumbnails, supports
on-the-fly image resizing, and serves adaptive video streams.

When **not** configured, the app falls through to:

1. **Vercel Blob** if `BLOB_READ_WRITE_TOKEN` is set (production-friendly)
2. **Local disk** under `public/uploads/` (dev only)

These fallbacks work, but you lose auto-thumbnails for videos and on-the-fly
image transforms. For a production-grade learner experience, configure
Cloudinary.

---

## Setup (one-time, ~5 minutes)

### 1. Create a Cloudinary account

- Go to <https://cloudinary.com> and sign up (free tier works for small
  deployments).
- After signup you land on the **Dashboard**.

### 2. Copy the four credential values

In the **Product Environment Credentials** card on the dashboard:

| Field on dashboard | Env var name |
|---|---|
| Cloud Name | `CLOUDINARY_CLOUD_NAME` |
| API Key | `CLOUDINARY_API_KEY` |
| API Secret | `CLOUDINARY_API_SECRET` |
| Cloud Name (same value) | `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` |

The `NEXT_PUBLIC_` duplicate is required — Next.js only exposes vars with
that prefix to the browser, and the upload widget needs the cloud name
client-side.

### 3. Create an upload preset

Cloudinary uses presets to control what client-side uploads can do.

1. Go to **Settings (gear icon) → Upload → Upload presets**.
2. Click **Add upload preset**.
3. Choose a name, e.g. `iesa-uploads` — this becomes
   `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`.
4. **Signing Mode**: pick **Signed** (recommended — server signs each
   upload, prevents abuse). The codebase uses signed uploads.
5. Save.

### 4. Add the five env vars

For local development, paste into `.env`:

```env
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME="your-cloud-name"
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET="iesa-uploads"
```

For Vercel deployments, set them in **Project Settings → Environment
Variables** (Production + Preview + Development).

### 5. Restart and test

- **Local**: `npm run dev` → restart server so env loads
- **Vercel**: `vercel --prod --yes` → fresh deploy picks up the new env

Open a draft course, click **+ Add Lecture → Video**, and upload a small
test video. The upload should:

- Show progress bar
- Land on `https://res.cloudinary.com/<cloud_name>/video/upload/...`
- Auto-generate a thumbnail visible in the lecture preview

If anything fails, the toast message will tell you which env var is missing.

---

## How the code uses Cloudinary

| File | Role |
|---|---|
| [`src/lib/cloudinary.ts`](../../src/lib/cloudinary.ts) | SDK config, signed-URL helper, asset deletion, thumbnail URL builder |
| [`src/app/api/upload/signature/route.ts`](../../src/app/api/upload/signature/route.ts) | Server endpoint that mints signed upload tokens |
| [`src/components/courses/video-upload.tsx`](../../src/components/courses/video-upload.tsx) | Browser upload form — calls signature endpoint then PUTs file to Cloudinary |
| [`src/components/courses/editor-sections/landing-page.tsx`](../../src/components/courses/editor-sections/landing-page.tsx) | Same pattern for course thumbnail upload |
| [`src/components/courses/course-content-editor.tsx`](../../src/components/courses/course-content-editor.tsx) | Builds thumbnail URLs via `getVideoThumbnail()` |
| [`src/lib/image-hosts.ts`](../../src/lib/image-hosts.ts) | Allowlist for `next/image`; includes `res.cloudinary.com` |

The upload flow tries Cloudinary first; on failure (missing creds, network),
it falls through to Vercel Blob, then local disk. This keeps the feature
optional without removing the code path.

---

## Removing Cloudinary later (not recommended)

If the project ever decides to drop Cloudinary entirely, here's what would
need to be touched:

- Delete `src/lib/cloudinary.ts` and `src/app/api/upload/signature/route.ts`
- Rewrite the upload flows in `video-upload.tsx`, `landing-page.tsx` to skip
  the Cloudinary path
- Remove `getVideoThumbnail()` usage from `course-content-editor.tsx` — and
  accept that video lectures no longer have thumbnails
- Remove `cloudinary` and `next-cloudinary` from `package.json`
- Remove `res.cloudinary.com` from `src/lib/image-hosts.ts`
- Drop `videoPublicId` from the `Lecture` Prisma model (data migration)

The simpler path is to leave Cloudinary as an opt-in feature — set the env
vars when you want it, leave them blank when you don't.
