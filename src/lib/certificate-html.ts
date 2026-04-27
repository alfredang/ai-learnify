import QRCode from "qrcode"
import type { Certificate, CertificateTemplate } from "@prisma/client"

export type CertificateRenderData = Pick<
  Certificate,
  | "certificateId"
  | "courseName"
  | "instructorName"
  | "nameToBeCalled"
  | "certificateName"
  | "certificateIdNumber"
  | "cpdName"
  | "cpdPoints"
  | "issuedAt"
  | "completionDate"
> & {
  template?: Pick<
    CertificateTemplate,
    "primaryLogoUrl" | "secondaryLogoUrl" | "signatoryName" | "signatoryTitle" | "layoutJson"
  > | null
  verifyUrl: string
}

/**
 * Spec §13: Customisable layout, up to 2 logos, Name to Be Called, course
 * title, completion date, CPD name & value, optional ID, QR/reference code.
 *
 * Returns a standalone HTML document. Learners hit "Print → Save as PDF"
 * from the browser, which matches the current download UX and skips the
 * pdf-lib dependency chain. The verify QR points to /verify/:certificateId.
 */
export async function renderCertificateHtml(data: CertificateRenderData): Promise<string> {
  const displayName =
    data.certificateName ?? data.nameToBeCalled ?? "Learner"
  const completionDate = new Date(data.completionDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const qrDataUrl = await QRCode.toDataURL(data.verifyUrl, { margin: 0, width: 140 })

  const layout =
    (data.template?.layoutJson as { accentColor?: string } | null) ?? null
  const accent = layout?.accentColor ?? "#1a365d"
  const primaryLogo = data.template?.primaryLogoUrl
  const secondaryLogo = data.template?.secondaryLogoUrl
  const cpdLine = data.cpdName
    ? `${data.cpdName}${data.cpdPoints ? ` · ${Number(data.cpdPoints)} CPD` : ""}`
    : null
  const signatoryName = data.template?.signatoryName ?? "Academy"
  const signatoryTitle = data.template?.signatoryTitle ?? ""

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Certificate - ${escapeHtml(data.courseName)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Open+Sans:wght@400;600&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Open Sans', sans-serif; background: #f5f5f5; padding: 20px; color: #2d3748; }
    .certificate {
      width: 1000px; min-height: 700px; margin: 0 auto; background: white;
      position: relative; padding: 48px 56px; border: 3px solid ${accent};
    }
    .certificate::before {
      content: ''; position: absolute; inset: 10px;
      border: 1px solid #cbd5e0; pointer-events: none;
    }
    .logos { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; min-height: 64px; }
    .logo-primary, .logo-secondary { max-height: 64px; max-width: 180px; object-fit: contain; }
    .header { text-align: center; margin-bottom: 24px; }
    .title { font-family: 'Playfair Display', serif; font-size: 40px; color: ${accent}; }
    .subtitle { font-size: 14px; color: #718096; text-transform: uppercase; letter-spacing: 3px; margin-top: 4px; }
    .content { text-align: center; padding: 24px 40px; }
    .presented { font-size: 13px; color: #718096; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 14px; }
    .recipient { font-family: 'Playfair Display', serif; font-size: 40px; color: #2d3748; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; display: inline-block; }
    .called { font-size: 13px; color: #718096; margin-bottom: 24px; font-style: italic; }
    .completion { font-size: 14px; color: #718096; margin-bottom: 12px; }
    .course-name { font-family: 'Playfair Display', serif; font-size: 26px; color: ${accent}; margin-bottom: 14px; }
    .cpd { display: inline-block; background: #ebf4ff; color: ${accent}; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; }
    .footer {
      display: grid; grid-template-columns: 1fr auto 1fr;
      align-items: end; gap: 20px; padding: 32px 40px 0;
    }
    .signature { text-align: center; }
    .signature-line { width: 220px; border-top: 1px solid #a0aec0; margin: 0 auto 6px; }
    .signature-name { font-size: 14px; font-weight: 600; }
    .signature-title { font-size: 12px; color: #718096; }
    .qr-block { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .qr-block img { width: 110px; height: 110px; }
    .qr-label { font-size: 10px; color: #718096; letter-spacing: 1px; text-transform: uppercase; }
    .date-info { text-align: center; }
    .date-label { font-size: 12px; color: #718096; margin-bottom: 4px; }
    .date-value { font-size: 14px; font-weight: 600; }
    .cert-id { text-align: center; margin-top: 22px; font-size: 11px; color: #a0aec0; letter-spacing: 0.5px; }
    .id-number { font-size: 11px; color: #a0aec0; margin-top: 4px; }
    .print-btn {
      display: block; margin: 20px auto; padding: 12px 30px; background: ${accent};
      color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer;
    }
    .print-btn:hover { filter: brightness(1.1); }
    @media print {
      body { background: white; padding: 0; }
      .certificate { border-color: ${accent}; box-shadow: none; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Download as PDF</button>

  <div class="certificate">
    <div class="logos">
      ${primaryLogo ? `<img class="logo-primary" src="${escapeAttr(primaryLogo)}" alt="Primary logo"/>` : '<div></div>'}
      ${secondaryLogo ? `<img class="logo-secondary" src="${escapeAttr(secondaryLogo)}" alt="Secondary logo"/>` : '<div></div>'}
    </div>

    <div class="header">
      <div class="title">Certificate of Completion</div>
      <div class="subtitle">Professional Development</div>
    </div>

    <div class="content">
      <div class="presented">This is to certify that</div>
      <div class="recipient">${escapeHtml(displayName)}</div>
      ${data.nameToBeCalled && data.nameToBeCalled !== displayName ? `<div class="called">known as ${escapeHtml(data.nameToBeCalled)}</div>` : ""}
      <div class="completion">has successfully completed the course</div>
      <div class="course-name">${escapeHtml(data.courseName)}</div>
      ${cpdLine ? `<div class="cpd">${escapeHtml(cpdLine)}</div>` : ""}
    </div>

    <div class="footer">
      <div class="signature">
        <div class="signature-line"></div>
        <div class="signature-name">${escapeHtml(signatoryName)}</div>
        <div class="signature-title">${escapeHtml(signatoryTitle)}</div>
      </div>

      <div class="qr-block">
        <img src="${qrDataUrl}" alt="Verification QR code"/>
        <div class="qr-label">Scan to verify</div>
      </div>

      <div class="date-info">
        <div class="date-label">Date of Completion</div>
        <div class="date-value">${completionDate}</div>
      </div>
    </div>

    <div class="cert-id">Certificate ID: ${escapeHtml(data.certificateId)}</div>
    ${data.certificateIdNumber ? `<div class="id-number" style="text-align:center;">Learner ID: ${escapeHtml(data.certificateIdNumber)}</div>` : ""}
  </div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function escapeAttr(s: string): string {
  return escapeHtml(s)
}
