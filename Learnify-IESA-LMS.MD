# Learninfy / IESA — Learning Management System (LMS)

**Full Product Specification — Ready for Development**

---

## 1. Product Overview

### 1.1 Objective
Develop an international, scalable, self-learning LMS that:
- Enables public discovery of learning content
- Supports paid courses, programmes (bundled courses), and free content
- Automates certification with strict rules
- Enforces transparent revenue sharing
- Retains learner records permanently
- Supports GenAI-assisted content authoring

### 1.2 Learning Model (LOCKED)
- ✅ Self-paced
- ✅ Asynchronous only
- ❌ No live classes
- ❌ No instructor-led sessions
- ❌ No manual grading

---

## 2. User Roles & Governance

| Role | Core Responsibility |
|---|---|
| Platform Owner | Commercial owner, monetisation policy |
| Platform Support | Security, uptime, technical support |
| Academy Admin | Organisation / Academy Administrator |
| Course Developer | Content creation & maintenance |
| Marketer / Affiliate | Promotion via promo codes |
| Learner | End-user consumer |

---

## 3. Authentication & Identity

### 3.1 Learners (Strict)
- Login: **Email + Password ONLY**
- Required field: *Name to be Written into the Certificate*
- Optional: *Identification Number to be Included into the Certificate*
- ✅ *Name to be Called* is:
  - Displayed throughout LMS
  - Printed on certificates
- ✅ Learners can register without joining any course

### 3.2 All Other Roles (Flexible — user rights assigned by Platform Owner)
*(Academy Admin, Platform Support, Marketer, Platform Owner, Course Developer)*
- Login via Username OR Email
- Username:
  - System-wide unique
  - Login only
  - Not printed or visible publicly

---

## 4. Public Internet Interface (No Login Required)

### 4.1 Landing Page (Public)
**Header (Mandatory)**
- Branding Banner (fixed)
  - Organisation branding
  - Always visible
- Advertising Banner Carousel
  - Up to 10 rotating banners
  - Link to courses, programmes, or external URLs
  - Auto-rotate with admin-configurable timing

### 4.2 Public Course & Programme Catalogue
- ✅ Accessible without login
- ✅ Displayed as thumbnail cards

Each card shows:
- Thumbnail image
- Title
- Partner name / logo
- Short write-up
- Fee or "Complimentary"
- Customisable CPD badge (if applicable)

### 4.3 Public Filtering & Sorting
**Filters:** Sector · CPD · Course / Programme · Price (Free / Paid) · Partner
**Sorting:** Newest · Alphabetical · Partner name · CPD points

### 4.4 Public Detail Page
Shows:
- Full description
- Learning objectives
- Module outline
- CPD info
- Fee
- Partner info

✅ Login required only when clicking **Join / Enrol**.

---

## 5. Learner Registration & Dashboard

### 5.1 Registration
- Email
- Password
- Name to be Called

✅ No purchase required.

### 5.2 Learner Dashboard
Sections:
- Complimentary Programme
- My Courses
- My Programmes
- Certificates
- Invoices & Receipts
- Profile

✅ Learners can view all historical records indefinitely.

---

## 6. Content Model

### 6.1 Complimentary Programme (FREE)
- Accessible to all registered learners
- Event videos & materials
- No expiry
- No payment
- No certificates
- No revenue sharing

### 6.2 E-Courses
- Paid or free
- Certificate-eligible if paid
- Content + quizzes + survey

### 6.3 Programmes
- Bundle of ≥ 2 courses
- Package pricing
- One payment
- One shared 3-month access window
- Certificates issued per course

---

## 7. Course Authoring & Content Tools

### 7.1 Supported Content Types
- Video (MP4)
- PDF
- HTML
- SCORM 1.2 / 2004
- xAPI
- Downloadables
- PowerPoint / PDF with Voice-Over (selectable) Text
- GenAI-assisted content

### 7.2 Course Builder
- Drag-and-drop modules
- Drag-and-drop courses for programme
- Lesson sequencing
- Drafts & version control

### 7.3 Assessments
- Auto-graded only
- MCQ / Multi-select / True-False
- Weighted scoring
- Retake rules configurable

### 7.4 Course Survey (Mandatory)
- Required for certification
- Completion-based
- Does not affect score

### 7.5 Voice-Over Slides
- ✅ Upload PPT / PPTX / PDF
- ✅ Slide-by-slide display
- ✅ Voice-over text per slide
- ✅ Editable, no audio required
- ✅ Counts toward content completion

---

## 8. GenAI-Assisted Authoring (FINAL)

### 8.1 AI Capabilities
AI assists (author-approved only):
- Course scoping & outlines
- Learning objectives
- Voice-over text generation
- Quiz drafting
- Metadata optimisation
- Content summarisation

✅ AI outputs are drafts only.

### 8.2 Licence-Free Media Curation
AI can recommend or generate (on author/developer command):
- Images / photos
- Diagrams / illustrations
- Icons
- Background audio (optional)

✅ Only:
- Public domain
- Creative Commons
- Platform-approved licence-free assets

✅ Asset licence metadata stored.

### 8.3 Governance
- Can be enabled/disabled per tenant
- Logged for audit
- Does NOT train external AI models
- Preserves author IP ownership

---

## 9. Learning Delivery Features
- Resume where left off
- Progress tracking
- Mobile-responsive
- Locked content after expiry

---

## 10. Payment, Invoice & Receipt

### 10.1 Payment Rules
- ✅ Payment via gateway required before access
- ✅ Applies to paid courses & programmes

### 10.2 Invoice & Receipt
- ✅ Generated only after successful payment
- ✅ Downloadable PDF and sent to learner email
- ✅ Stored permanently
- ❌ No pre-payment invoices

---

## 11. Access Duration & Reminders

### 11.1 Access Rule (LOCKED)
- ✅ 3 months (90 days) from payment
- ✅ Applies to course & programme
- ✅ Programme uses one shared window

### 11.2 Reminder Emails
- End of Month 1
- End of Month 2
- 2 weeks before expiry

---

## 12. Default-but-Configurable Certification Rules

Requirements (ALL):
- ≥ 50% content completion
- ≥ 80% assessment score
- Survey completed
- Before expiry

✅ Automated only.

---

## 13. E-Certificate System
- Customisable layout
- Up to 2 logos
- Name to be Called
- Course title
- Completion date
- CPD points name & value
- Optional ID
- QR / reference code

✅ PDF output.

---

## 14. Refund Policy
- ✅ Non-refundable by default
- ✅ Manual admin refunds only (exceptional)
- ✅ Ledger reversal required

---

## 15. Revenue & Profit Sharing (FINAL)

**Distribution Order (LOCKED):**
1. Marketer Commission — % of full course / programme fee
2. Platform Support Fixed Fee — same for course & programme
3. Learner discount % by default (Promo Code)
4. Remaining balance:
   - Academy Admin
   - Partner (Course Developer)

**Grouped Payouts:**
- Admin → organisation payout
- Course Developer(s) → partner-grouped payouts
- Marketer → marketer account
- Platform Support → aggregated fixed fees

---

## 16. Ledger & Accounting

✅ Immutable ledger captures:
- Full fee
- Marketer Commission %
- Marketer Commission amount
- Platform Support fee
- Learner Discount
- Academy Admin share
- Partner share(s)
- Payout group IDs

✅ Exportable & auditable.

---

## 17. Data Retention & Account Control
- ✅ Learner records retained indefinitely
- ✅ Learner sees all past records
- ✅ Admin may deactivate (data preserved)

---

## 18. Internationalisation & Compliance

**International**
- Multi-language UI
- UTF-8 name support
- Multi-currency pricing (must show SGD pricing)

**Tax & Finance**
- VAT / GST support
- Jurisdiction-aware invoices

**Security & Privacy**
- Encrypted passwords
- Role-based access
- Audit logs
- GDPR & PDPA readiness

---

## 19. Development Status
- ✅ Requirements COMPLETE
- ✅ UX COMPLETE
- ✅ Authoring COMPLETE
- ✅ AI COMPLETE
- ✅ Finance COMPLETE
- ✅ Compliance COMPLETE

---

# Role-Based Experience Walkthrough

## 1. Public Visitor (No Login)

**Step 1: Lands on Platform**
- Sees fixed branding banner at top
- Below it: advertising carousel (auto-rotating)
- Entire page accessible without login

**Step 2: Browses Catalogue**
- Scrolls through course & programme cards
- Each card shows: thumbnail, title, partner logo/name, short description, price or "Complimentary", CPD badge (if applicable)

**Step 3: Filters & Sorts**
- Uses filters (sector, CPD, price, partner)
- Sorts by newest, alphabetical, CPD points, etc.
- No friction, no registration wall

**Step 4: Views Detail Page**
- Clicks a card → sees full detail page
- Reads: learning objectives, module outline, CPD value, fee and partner info

✅ Only when clicking **Join / Enrol** → redirected to registration/login.

---

## 2. Learner

**Step 1: Registration (Friction-Light)**
- Inputs: Email, Password, Name to be Written in Certificate
- No payment required
- Immediately lands in dashboard

**Step 2: Learner Dashboard (Home)**
Tabs: Complimentary Programme · My Courses · My Programmes · Certificates · Invoices & Receipts · Profile.
✅ All historical records always visible.

**Step 3: Complimentary Programme**
- Automatically available to all learners
- Watches event recordings, downloads materials
- No expiry · No certificate · No progress pressure

**Step 4: Enrolling in Paid Course / Programme**
- Clicks Join → redirected to payment gateway
- Upon success:
  - Invoice + receipt auto-generated
  - 90-day access timer starts
  - Course appears in dashboard

**Step 5: Learning Experience**
- Starts course
- System tracks: content completion %, assessment scores
- Can leave and resume where they left off
- Content auto-locks after expiry

**Step 6: Assessment & Survey**
- Takes auto-graded quiz; can retake if allowed
- Must complete mandatory survey
- Course Survey satisfaction rating collated and displayed as "1 to 5 star" prominently in Academy Admin dashboard; optional public display in the course

**Step 7: Certification**
- System checks all rules automatically
- If compliant: certificate instantly issued, appears in Certificates tab, PDF downloadable with QR / reference code

**Step 8: Long-Term Record Keeping**
- Even years later: certificates, invoices, courses taken, completion history
- ✅ Nothing is deleted

---

## 3. Course Author

**Step 1: Login** — username or email; username never visible to public.

**Step 2: Developer or Author Dashboard** — Draft courses · Published courses · Version history · Revenue-linked courses.

**Step 3: Creating a Course or Programme**
- Clicks "Create New Course"
- Uses drag-and-drop course builder
- Creates programme (bundle of courses)

**Step 4: Adding Content**
- Uploads: Videos · PDFs · SCORM / xAPI · Voice-over slides
- Organises modules & lessons
- Defines sequencing rules

**Step 5: Assessments**
- Creates quizzes: MCQ, multi-select, true/false, drag-and-drop
- Sets: pass mark (default 80%), weighting, retake rules (default no limit)

**Step 7: GenAI-Assisted Authoring (if enabled)**
- Clicks "AI Assist"
- AI drafts: learning objectives, quiz questions, voice-over text
- Author reviews, edits, approves
- ✅ AI never auto-publishes

**Step 8: Publish**
- Submits for Academy Admin approval
- Once published: visible in public catalogue, revenue tracking begins

---

## 4. Academy Admin (Organisation / Academy)

**Step 1: Login** — sees tenant-specific admin dashboard.

**Step 2: Academy Configuration** — Branding · Language availability · Currency · Tax rules · AI enable/disable · CPD update · Mandatory survey (completion-based, flagged required for certification).

**Step 3: Course & Programme Governance**
- Approves courses and programmes before publishing
- Sets package pricing
- Defines author revenue splits (default 50/50)

**Step 4: Marketing Controls**
- Creates promo codes
- Assigns marketer commissions
- Tracks campaign performance

**Step 5: Learner Management**
- Views learners (name and email; attended free and paid)
- Can deactivate (data preserved)
- Cannot edit certificates or grades
- Can sort and filter data to derive statistics for marketing based on interest, demand, and survey for business decisions

**Step 6: Finance & Ledger**
- Views immutable ledger: gross fee, Marketer Commission, Developer fee, discounts, taxes, admin & author share
- Exports customisable records for periodic reporting, payment to stakeholders, and audit

**Step 7: Payouts**
- Sees grouped organisation or partners (combination of developers), platform support, author/developer & marketer payouts separately; selectable by customisable period
- Customise form to raise payment and update status for tracking

---

## 5. Marketer / Affiliate

**Step 1: Login** — accesses marketer dashboard.

**Step 2: Performance Tracking** — Clicks · Conversions · Commission earned. No access to learner personal data beyond attribution.

**Step 3: Payout** — Receives payout. Ledger entries visible but immutable.

---

## 6. Platform Owner

**Step 1: Strategic Dashboard** — Global revenue · Academy performance · Platform growth.

**Step 2: Policy Control**
- Monetisation rules
- Customisable Platform Support fee
- Customisable Marketer Commission %
- Partner / Developer customisable fee structure (default 50/50)
- ✅ Cannot modify locked rules (learning model, certification logic)

**Step 3: Promotion Setup**
- Generates promo codes; each code tied to: Marketer Commission %, Customisable Learner Discount %

**Step 4: Compliance Oversight** — Audit logs · Ledger integrity · Policy enforcement.

---

## 7. Platform Support

**Step 1: System Access** — No business or learner interference; focused on infrastructure.

**Step 2: Technical Operations** — Uptime · Security · Backups · Performance scaling · API to payment gateway.

**Step 3: Fixed Fee Collection** — Receives fixed fee per transaction periodically; aggregated, non-negotiable, fully auditable.

---

## Summary (Why This Design Is Strong)
- ✅ Clear separation of responsibilities
- ✅ Zero manual grading or certification risk
- ✅ Fully auditable finance & compliance
- ✅ Scales internationally
- ✅ AI augments authors without replacing control
- ✅ Learner trust via permanent records

---

# TODO — Development Checklist (derived from spec)

## Foundation
- [ ] Multi-tenant data model (Platform Owner → Academy Admin → Partner/Developer)
- [ ] Role & permission system (6 roles with Platform-Owner-assignable rights)
- [ ] Encrypted password storage; audit logging; GDPR & PDPA controls
- [ ] Multi-language UI · UTF-8 names · Multi-currency (SGD must display)

## Authentication
- [ ] Learner auth: Email + Password only; capture *Name on Certificate* + optional ID
- [ ] Non-learner auth: Username OR Email login; system-wide unique usernames (not public)

## Public Site (No-Login)
- [ ] Fixed branding banner + advertising carousel (≤ 10 banners, admin-configurable rotation)
- [ ] Public catalogue cards (thumbnail, title, partner, blurb, fee/Complimentary, CPD badge)
- [ ] Filters: Sector · CPD · Course/Programme · Price · Partner
- [ ] Sorts: Newest · Alphabetical · Partner · CPD points
- [ ] Public detail page (objectives, modules, CPD, fee, partner)
- [ ] Login wall only on Join/Enrol click

## Learner Experience
- [ ] Registration flow (no purchase required)
- [ ] Dashboard with 6 sections (Complimentary, My Courses, My Programmes, Certificates, Invoices & Receipts, Profile)
- [ ] Indefinite history retention & display
- [ ] Resume-where-left-off · Progress tracking · Mobile-responsive · Auto-lock on expiry

## Content Model
- [ ] Complimentary Programme (free, no expiry, no cert, no revenue split)
- [ ] E-Courses (paid/free, cert if paid)
- [ ] Programmes (≥ 2 courses bundled, single payment, shared 90-day window, per-course certs)

## Course Authoring
- [ ] Drag-and-drop course builder · Drag-and-drop programme builder
- [ ] Drafts & version control · Lesson sequencing
- [ ] Content type support: MP4 · PDF · HTML · SCORM 1.2 / 2004 · xAPI · downloadables · PPT/PDF + Voice-Over text · GenAI content
- [ ] Voice-over slides (PPT/PPTX/PDF upload, per-slide voice-over text, no audio required, counts toward completion)
- [ ] Auto-graded assessments (MCQ, multi-select, T/F, drag-and-drop); weighted scoring; configurable retakes (default unlimited); default 80% pass mark
- [ ] Mandatory completion-based survey (does not affect score; required for cert)
- [ ] Survey star rating roll-up to Academy Admin dashboard; optional public display

## GenAI Authoring
- [ ] AI assist for: outlines, learning objectives, voice-over text, quizzes, metadata, summaries (drafts only)
- [ ] Licence-free media curation (public domain · CC · platform-approved); store licence metadata
- [ ] Per-tenant AI on/off toggle
- [ ] AI usage audit log; no external model training; preserve author IP

## Payment, Invoice, Access
- [ ] Payment-gateway integration (gate access until paid)
- [ ] Auto-generate downloadable PDF invoice + receipt on success; email to learner; permanent storage
- [ ] No pre-payment invoices
- [ ] 90-day access timer starts on payment (shared window for programmes)
- [ ] Reminder emails: end of Month 1, end of Month 2, 2 weeks before expiry

## Certification
- [ ] Auto-issue rules (≥ 50% content, ≥ 80% assessment, survey done, before expiry)
- [ ] Customisable certificate layout (up to 2 logos, Name to be Called, course title, date, CPD name & value, optional ID, QR/reference code)
- [ ] PDF output

## Refunds
- [ ] Non-refundable by default
- [ ] Manual admin refund flow (exceptional) with ledger reversal

## Revenue, Ledger, Payouts
- [ ] Revenue split engine in locked order: Marketer Commission → Platform Support fixed fee → Learner discount % → remaining split between Academy Admin and Partner (default 50/50)
- [ ] Immutable ledger fields: full fee · marketer % · marketer amount · platform support fee · learner discount · admin share · partner share(s) · payout group IDs
- [ ] Exportable / auditable ledger
- [ ] Grouped payouts: organisation, partner-grouped, marketer, platform support
- [ ] Customisable payout period selector + payment-request form with status tracking

## Academy Admin Tools
- [ ] Branding · language · currency · tax-rule configuration
- [ ] AI enable/disable per tenant
- [ ] CPD configuration
- [ ] Course/programme approval workflow before publishing
- [ ] Package pricing controls; author split overrides
- [ ] Promo code creation; marketer commission assignment; campaign performance
- [ ] Learner list with deactivation (data preserved); cannot edit certs/grades
- [ ] Filterable learner statistics (interest, demand, survey) for business decisions
- [ ] Finance/ledger view + customisable export

## Marketer Dashboard
- [ ] Clicks / conversions / commission earned reporting
- [ ] Attribution-only access to learner data
- [ ] Immutable ledger entries view; payout view

## Platform Owner Console
- [ ] Strategic dashboard (global revenue, academy performance, growth)
- [ ] Policy controls: Platform Support fee, Marketer Commission %, Partner/Developer split (default 50/50)
- [ ] Locked rules guard (learning model, certification logic)
- [ ] Promo code generator (Marketer Commission %, Learner Discount %)
- [ ] Compliance oversight: audit logs, ledger integrity, policy enforcement

## Platform Support Console
- [ ] Infrastructure-only access (no business/learner data interference)
- [ ] Uptime · security · backups · scaling · payment gateway API
- [ ] Fixed-fee-per-transaction aggregation and audit view

## Tax & Internationalisation
- [ ] VAT / GST support · jurisdiction-aware invoices

## Data Retention
- [ ] Indefinite learner record retention; deactivate-but-preserve flow
