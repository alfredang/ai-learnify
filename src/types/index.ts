import type {
  User,
  Course,
  Section,
  Lecture,
  Enrollment,
  Review,
  Category,
  Purchase,
  InstructorApplication,
} from "@prisma/client"

export type CourseWithInstructor = Course & {
  instructor: Pick<User, "id" | "name" | "image" | "headline">
  category: Category
  // Phase 2: optional catalogue metadata rendered on CourseCard.
  sector?: { id: string; name: string; slug: string } | null
  cpdCatalog?: {
    id: string
    name: string
    points: number | string
    badgeUrl?: string | null
  } | null
}

export type CourseWithDetails = Course & {
  instructor: Pick<User, "id" | "name" | "image" | "headline" | "bio">
  category: Category
  sections: (Section & {
    lectures: Lecture[]
  })[]
  reviews: (Review & {
    user: Pick<User, "id" | "name" | "image">
  })[]
  _count: {
    enrollments: number
    reviews: number
  }
}

export type EnrolledCourse = Enrollment & {
  course: CourseWithInstructor & {
    sections: (Section & {
      lectures: Lecture[]
    })[]
  }
}

export type CourseForLearning = Course & {
  instructor: Pick<User, "id" | "name" | "image">
  sections: (Section & {
    lectures: (Lecture & {
      progress?: {
        isCompleted: boolean
        lastPosition: number
      }[]
    })[]
  })[]
}

export type InstructorCourse = Course & {
  category: Category
  _count: {
    enrollments: number
    reviews: number
  }
}

export type ReviewWithUser = Review & {
  user: Pick<User, "id" | "name" | "image">
}

export type PurchaseWithCourse = Purchase & {
  course: Pick<Course, "id" | "title" | "slug" | "thumbnail">
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
}

export interface CourseFilters {
  search?: string
  category?: string
  level?: string
  price?: string
  rating?: string
  sort?: string
  page?: number
}

export type FavouriteCourse = {
  id: string
  createdAt: Date
  course: CourseWithInstructor
}

export type CartItemCourse = {
  id: string
  createdAt: Date
  course: CourseWithInstructor
}

export type ApplicationWithUser = InstructorApplication & {
  user: Pick<User, "id" | "name" | "email" | "image">
  reviewedBy?: Pick<User, "id" | "name"> | null
}

export interface ApiError {
  message: string
  code?: string
}

// Quiz Builder Types — spec §7.3: auto-graded MCQ / Multi-select / True-False
// plus drag-and-drop per Author Step 5.
export type QuizQuestionType =
  | "multiple_choice"
  | "multiple_select"
  | "open_ended"
  | "true_false"
  | "drag_drop"

export interface QuizOption {
  id: string
  text: string
  isCorrect: boolean
  /** For drag_drop — the correct zero-based position in the ordered list. */
  correctOrder?: number
}

export interface QuizQuestion {
  id: string
  type: QuizQuestionType
  text: string
  options: QuizOption[]
  explanation?: string
  points: number
}

export interface QuizData {
  version: 1
  passingScore?: number
  questions: QuizQuestion[]
}
