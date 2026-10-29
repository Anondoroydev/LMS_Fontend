# Classroom frontend

This standalone React + TypeScript app lives in `frontend/` and uses the backend API from the repository root.

## Run locally

1. Start the backend from the repository root:

   ```sh
   npm run dev
   ```

2. In this directory, copy `.env.example` to `.env` if needed. Leave `VITE_API_URL` empty for local development; Vite proxies `/api` requests to `http://127.0.0.1:4000`. If your backend uses another origin, set `VITE_API_URL` to that origin (without `/api`).

3. Install and start the frontend:

   ```sh
   cd frontend
   npm install
   npm run dev
   ```

4. Open `http://localhost:3000`. The local Vite proxy avoids browser-to-backend CORS and localhost networking issues.

The backend must be able to connect to PostgreSQL before login can work. If `npm run dev` exits during its super-admin bootstrap, check that `DATABASE_URL` in the root `.env` points to a running, reachable database, then apply migrations with `npm run prisma:deploy` from the repository root.

## Direct routes and public hosting

After signing in, students use a homepage-style learning portal with direct course, profile, and progress URLs: `/student/courses`, `/student/profile`, and `/student/progress`. Teachers and admins have their own dashboard routes. The app restores the selected section on refresh and browser back/forward.

To host the frontend publicly on Vercel, create a separate Vercel project with the repository's **Root Directory** set to `frontend`. The included `vercel.json` sends direct dashboard URLs back to the app. Set `VITE_API_URL` in that frontend project's environment variables to the deployed backend origin (for example `https://your-api.example.com`, without `/api`), then set the backend's `CORS_ORIGIN` to the frontend's exact public origin. The root Vercel project is the API deployment; it does not host this frontend.

## Included screens

- Student registration and sign-in
- Required student profile completion after sign-up (name, phone, parent names, and class), with profile editing
- Password recovery by email reset code
- Student course materials, assignment submission, teacher/course chat, and learning progress
- Teacher course/class creation, folders, written or linked lessons, assignments, and grading
- Super-admin teacher and student rosters, class-wise student grouping, teacher creation, enrollment, and enrollment removal

Teachers can add a written lesson from a class folder using **Add lesson → Written lesson**. For a live session, choose **Live class link** and paste the meeting URL; students see the lesson and link in that folder.

Students and the owning teacher can exchange course messages from the course page; the chat refreshes every few seconds. A live class opens the meeting link provided by the teacher.

Enrolled students can open a video lesson in the built-in player from the course page. This standard browser playback does not guarantee prevention of downloads or screen recording. A DRM streaming provider is needed for stronger playback protection.
