import { CourseCard } from "./course-card"
import type { CourseWithInstructor } from "@/types"

interface CourseGridProps {
  courses: CourseWithInstructor[]
  favouritedCourseIds?: Set<string>
  cartCourseIds?: Set<string>
  enrolledCourseMap?: Map<string, number>
}

export function CourseGrid({ courses, favouritedCourseIds, cartCourseIds, enrolledCourseMap }: CourseGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {courses.map((course) => (
        <CourseCard
          key={course.id}
          course={course}
          isFavourited={favouritedCourseIds?.has(course.id)}
          isInCart={cartCourseIds?.has(course.id)}
          isOwned={enrolledCourseMap?.has(course.id)}
          progress={enrolledCourseMap?.get(course.id)}
        />
      ))}
    </div>
  )
}
