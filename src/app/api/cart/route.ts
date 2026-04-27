import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      )
    }

    const cartItems = await prisma.cartItem.findMany({
      where: { userId: session.user.id },
      include: {
        course: {
          include: {
            instructor: {
              select: { id: true, name: true, image: true, headline: true },
            },
            category: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ cartItems })
  } catch (error) {
    console.error("[CART_GET]", error)
    return NextResponse.json(
      { error: "Failed to fetch cart", code: "CART_FETCH_FAILED" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { courseId } = body

    if (!courseId || typeof courseId !== "string") {
      return NextResponse.json(
        { error: "Course ID is required", code: "INVALID_INPUT" },
        { status: 400 }
      )
    }

    // Verify course exists and is published
    const course = await prisma.course.findUnique({
      where: { id: courseId, status: "PUBLISHED" },
      select: { id: true, isFree: true, instructorId: true },
    })

    if (!course) {
      return NextResponse.json(
        { error: "Course not found", code: "COURSE_NOT_FOUND" },
        { status: 404 }
      )
    }

    // Don't allow adding own course to cart
    if (course.instructorId === session.user.id) {
      return NextResponse.json(
        { error: "Cannot add your own course to cart", code: "OWN_COURSE" },
        { status: 400 }
      )
    }

    // Check if already enrolled
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: session.user.id, courseId },
      },
    })

    if (enrollment) {
      return NextResponse.json(
        { error: "Already enrolled in this course", code: "ALREADY_ENROLLED" },
        { status: 409 }
      )
    }

    // Check if already in cart
    const existing = await prisma.cartItem.findUnique({
      where: {
        userId_courseId: { userId: session.user.id, courseId },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: "Course already in cart", code: "ALREADY_IN_CART" },
        { status: 409 }
      )
    }

    await prisma.cartItem.create({
      data: {
        userId: session.user.id,
        courseId,
      },
    })

    return NextResponse.json({ added: true }, { status: 201 })
  } catch (error) {
    console.error("[CART_POST]", error)
    return NextResponse.json(
      { error: "Failed to add to cart", code: "CART_ADD_FAILED" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const courseId = searchParams.get("courseId")

    // Clear entire cart
    if (!courseId) {
      await prisma.cartItem.deleteMany({
        where: { userId: session.user.id },
      })
      return NextResponse.json({ cleared: true })
    }

    // Remove specific item
    const item = await prisma.cartItem.findUnique({
      where: {
        userId_courseId: { userId: session.user.id, courseId },
      },
    })

    if (!item) {
      return NextResponse.json(
        { error: "Item not in cart", code: "NOT_IN_CART" },
        { status: 404 }
      )
    }

    await prisma.cartItem.delete({
      where: { id: item.id },
    })

    return NextResponse.json({ removed: true })
  } catch (error) {
    console.error("[CART_DELETE]", error)
    return NextResponse.json(
      { error: "Failed to remove from cart", code: "CART_REMOVE_FAILED" },
      { status: 500 }
    )
  }
}
