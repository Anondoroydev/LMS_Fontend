export type Role = "STUDENT" | "TEACHER" | "SUPER_ADMIN";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface StudentProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  fatherName: string | null;
  motherName: string | null;
  className: string | null;
}

export interface AdminTeacher {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  _count: { courses: number };
}

export interface AdminStudent extends StudentProfile {
  createdAt: string;
  enrollments: Array<{
    id: string;
    batch: {
      id: string;
      name: string;
      course: { id: string; title: string };
    };
  }>;
}

export interface Batch {
  id: string;
  name: string;
  _count?: { enrollments: number };
}

export interface Course {
  id: string;
  title: string;
  description?: string | null;
  teacher?: { id: string; name: string };
  studentCount?: number;
  batches?: Batch[];
  batch?: Batch;
}

export interface CourseReview {
  id: string;
  rating: number;
  content: string;
  createdAt: string;
  student: { name: string };
}

export interface CourseMessage {
  id: string;
  content: string;
  createdAt: string;
  sender: { id: string; name: string; role: Role };
}

export interface Content {
  id: string;
  title: string;
  type: "VIDEO" | "LIVE_LINK" | "DOCUMENT" | "TEXT";
  videoUrl?: string | null;
  liveUrl?: string | null;
  documentUrl?: string | null;
  textContent?: string | null;
}

export interface Homework {
  id: string;
  title: string;
  description?: string | null;
  dueDate: string;
  submissions?: Array<{ id: string; fileUrl?: string | null; marks?: number | null }>;
}

export interface Folder {
  id: string;
  title: string;
  contents: Content[];
  homework: Homework[];
}

export interface ProgressBatch {
  batchId: string;
  batchName: string;
  course: { id: string; title: string };
  totalVideos: number;
  completedVideos: number;
  completionPercentage: number;
  watchDuration: number;
}
