# Welcome to Learnify

<div align="center">
  <img src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600" alt="Learnify Platform" style="border-radius: 10px; margin: 20px 0;" />

  <p><strong>🚀 Live Demo:</strong> <a href="https://learnify.tertiaryinfotech.com">https://learnify.tertiaryinfotech.com</a></p>

  <p>
    <a href="https://github.com/alfredang/ai-learnify"><img src="https://img.shields.io/badge/GitHub-Repository-181717?logo=github" alt="GitHub"></a>
    <a href="https://learnify.tertiaryinfotech.com"><img src="https://img.shields.io/badge/Docker-Coolify-2496ED?logo=docker&logoColor=white" alt="Deployed with Coolify"></a>
  </p>
</div>

**Learnify** is a modern, full-featured online learning marketplace where instructors create courses and students learn. Built with cutting-edge technologies for optimal performance and developer experience.

## Live Demo Links

| Page | Description |
|------|-------------|
| [🏠 Homepage](https://learnify.tertiaryinfotech.com/) | Landing page with featured courses |
| [📚 All Courses](https://learnify.tertiaryinfotech.com/courses) | Browse published courses |
| [📂 Categories](https://learnify.tertiaryinfotech.com/categories) | Browse course categories |
| [🔍 Search](https://learnify.tertiaryinfotech.com/search) | Search for courses |
| [ℹ️ About](https://learnify.tertiaryinfotech.com/about) | About the platform |
| [👨‍🏫 Become Instructor](https://learnify.tertiaryinfotech.com/become-instructor) | Instructor signup |
| [🔐 Login](https://learnify.tertiaryinfotech.com/login) | User login |
| [📝 Register](https://learnify.tertiaryinfotech.com/register) | New user signup |

## Key Features

<div class="grid cards" markdown>

-   :material-account-school:{ .lg .middle } **For Students**

    ---

    Browse courses, track progress, earn certificates, and manage your learning journey.

    - 🔍 Browse & search courses with filters
    - 📚 Enroll in free or paid courses
    - 📊 Track learning progress
    - 🎥 Watch video lectures
    - ⭐ Leave reviews and ratings
    - 📜 Earn completion certificates

-   :material-teach:{ .lg .middle } **For Instructors**

    ---

    Create courses, upload videos, set pricing, and monitor student engagement.

    - 📝 Create multimedia courses
    - 🎬 Upload videos via Cloudinary
    - 💰 Set flexible pricing
    - 📈 Analytics dashboard
    - 💵 Track earnings (70% revenue)
    - 📊 Monitor engagement

-   :material-shield-account:{ .lg .middle } **For Administrators**

    ---

    Manage users, approve courses, track revenue, and oversee the platform.

    - 👥 User management
    - ✅ Course approval workflow
    - 📂 Category management
    - 💳 Revenue tracking
    - ⚙️ Platform settings

</div>

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Next.js 16** | React framework with App Router |
| **React 19** | UI library |
| **TypeScript** | Type-safe JavaScript |
| **Tailwind CSS 4** | Utility-first CSS |
| **Prisma** | Type-safe ORM |
| **PostgreSQL 17** | Relational database (Coolify-managed container) |
| **NextAuth.js v5** | Authentication |
| **Stripe** | Payment processing |
| **Cloudinary** | Media storage (local `STORAGE_DIR` fallback) |
| **OpenAI + DeepSeek** | AI Assist and SCORM Studio (OpenAI primary, DeepSeek fallback) |
| **shadcn/ui** | UI components |
| **Recharts** | Charts for analytics |

## Application Routes

### Public Routes

| Route | Description |
|-------|-------------|
| `/` | Homepage with featured courses |
| `/courses` | Browse all courses |
| `/courses/[slug]` | Course details page |
| `/categories` | All categories |
| `/categories/[slug]` | Category courses |
| `/search` | Search courses |
| `/about` | About page |
| `/become-instructor` | Instructor signup (new users) or auto-promote (existing students) |
| `/login` | Login page |
| `/register` | Registration |

### Protected Routes

| Route | Role | Description |
|-------|------|-------------|
| `/my-courses` | Student | Enrolled courses |
| `/my-courses/[id]` | Student | Course overview |
| `/my-courses/[id]/lectures/[id]` | Student | Lecture viewer (video, quiz) |
| `/cart` | Student | Shopping cart |
| `/favourites` | Student | Saved courses |
| `/account` | Student | Account settings |
| `/account/invoices` | Student | Invoice history |
| `/account/purchases` | Student | Purchase history |
| `/certificates` | Student | Completion certificates |
| `/messages` | Student | Messages |
| `/notifications` | Student | Notifications |
| `/instructor` | Instructor | Course list (dashboard) |
| `/instructor/courses/new` | Instructor | Create course (3-step wizard) |
| `/instructor/courses/[id]` | Instructor | Course editor (sidebar checklist) |
| `/instructor/performance` | Instructor | Revenue & analytics |
| `/instructor/tools` | Instructor | Instructor tools |
| `/instructor/profile` | Instructor | Profile management |
| `/admin` | Admin | Admin dashboard |
| `/admin/users` | Admin | User management |
| `/admin/courses` | Admin | Course management |
| `/admin/applications` | Admin | Instructor applications |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/[...nextauth]` | ALL | Authentication |
| `/api/auth/register` | POST | User registration |
| `/api/categories` | GET | List categories |
| `/api/courses` | GET | List courses |
| `/api/courses` | POST | Create course |
| `/api/courses/[id]` | GET | Get course details |
| `/api/courses/[id]` | PUT | Update course |
| `/api/courses/[id]` | DELETE | Delete course |
| `/api/courses/[id]/sections` | POST | Create section |
| `/api/courses/[id]/sections/reorder` | PUT | Reorder sections |
| `/api/courses/[id]/sections/[sId]` | PUT/DELETE | Update/delete section |
| `/api/courses/[id]/sections/[sId]/lectures` | POST | Create lecture |
| `/api/courses/[id]/sections/[sId]/lectures/reorder` | PUT | Reorder lectures |
| `/api/courses/[id]/sections/[sId]/lectures/[lId]` | PUT/DELETE | Update/delete lecture |
| `/api/lectures/[id]/progress` | POST | Update lecture progress |
| `/api/courses/[id]/reviews` | GET/POST | List/create reviews |
| `/api/courses/[id]/reviews/[rId]` | PUT/DELETE | Update/delete review |
| `/api/enrollments` | GET/POST | Enrollment management |
| `/api/cart` | GET/POST/DELETE | Cart management |
| `/api/favourites` | POST/DELETE | Add/remove favourites |
| `/api/checkout` | POST | Create Stripe checkout |
| `/api/checkout/verify` | POST | Verify checkout session |
| `/api/webhooks/stripe` | POST | Stripe webhooks |
| `/api/upload/signature` | POST | Cloudinary upload signature |
| `/api/certificates/generate` | POST | Generate certificate |
| `/api/certificates/[id]/download` | GET | Download certificate |
| `/api/invoices/[id]` | GET | Get invoice details |
| `/api/instructor-applications` | GET/POST | Application status/submit |
| `/api/admin/instructor-applications` | GET | List applications (admin) |
| `/api/admin/instructor-applications/[id]` | PATCH | Approve/reject (admin) |
| `/api/become-instructor` | POST | Promote student to instructor |
| `/api/profile` | GET/PUT | Get or update user profile |
| `/api/profile/image` | POST | Upload profile image |

## Quick Start

```bash
# Clone the repository
git clone https://github.com/alfredang/ai-learnify.git
cd ai-learnify

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Set up database
npx prisma generate
npm run db:push
npm run db:seed

# Start development server
npm run dev
```

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://..."

# NextAuth
AUTH_SECRET="your-secret"
AUTH_URL="http://localhost:3000"

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Cloudinary
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME="..."
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET="..."

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

## Test Accounts

After seeding the database, use these accounts:

| Role | Email | Password |
|------|-------|----------|
| 👑 Admin | `admin@learnify.com` | `password123` |
| 👨‍🏫 Instructor | `john@learnify.com` | `password123` |
| 👨‍🏫 Instructor | `sarah@learnify.com` | `password123` |
| 👨‍🎓 Student | `student1@example.com` | `password123` |

## Database Models

| Model | Description |
|-------|-------------|
| **User** | Users with roles (STUDENT, INSTRUCTOR, ADMIN) |
| **Course** | Courses with title, description, price |
| **Category** | Course categories |
| **Section** | Course sections/modules |
| **Lecture** | Lectures (VIDEO, TEXT, QUIZ types) |
| **Resource** | Lecture resources/files |
| **Enrollment** | Student enrollments |
| **LectureProgress** | Per-lecture progress tracking |
| **Review** | Course reviews and ratings |
| **Purchase** | Payment records |
| **Earning** | Instructor earnings and payouts |
| **Certificate** | Completion certificates |
| **Wishlist** | Favourites (saved courses) |
| **CartItem** | Shopping cart items |
| **InstructorApplication** | Instructor applications |
| **PlatformSettings** | Configurable platform fees |

## Project Structure

```
learnify/
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── seed.ts          # Seed data
├── docs/                # Documentation
├── src/
│   ├── app/             # Next.js App Router
│   │   ├── (auth)/      # Auth pages
│   │   ├── (browse)/    # Public pages
│   │   ├── (student)/   # Student pages
│   │   ├── (instructor)/ # Instructor pages
│   │   ├── (admin)/     # Admin pages
│   │   └── api/         # API routes
│   ├── components/      # React components
│   ├── lib/             # Utilities
│   └── middleware.ts    # Route protection
└── package.json
```

## Deployment

The application is deployed as a **Docker container on a Hostinger VPS managed by Coolify** (see [Coolify deployment guide](deployment/coolify.md)):

- **Live URL:** [learnify.tertiaryinfotech.com](https://learnify.tertiaryinfotech.com)
- **Database:** PostgreSQL 17 (Coolify-managed container on the same server)
- **Media:** Cloudinary, or local disk under `STORAGE_DIR` (persistent volume at `/app/storage`)
- **AI:** OpenAI `gpt-6.1-sol` with DeepSeek V4.1 Flash fallback
- **Payments:** Stripe
- **TLS:** Traefik + Let's Encrypt
- **CI/CD:** GitHub push webhook → Coolify rebuild; GitHub Actions lint/typecheck/test-build only

## Support

- [Live Demo](https://learnify.tertiaryinfotech.com) - Try the platform
- [GitHub Repository](https://github.com/alfredang/ai-learnify) - Source code
- [GitHub Issues](https://github.com/alfredang/ai-learnify/issues) - Report bugs

---

Made with :heart: by [Alfred Ang](https://github.com/alfredang)
