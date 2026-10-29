import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "./api";
import type { AdminStudent, AdminTeacher, Batch, Content, Course, CourseMessage, CourseReview, Folder, Homework, ProgressBatch, Role, StudentProfile, User } from "./types";

type AuthView = "login" | "register" | "forgot" | "reset";
type TeacherPage = "overview" | "courses" | "classes" | "students";
type AdminPage = "overview" | "teachers" | "courses" | "students";

function requiredFormValue(form: FormData, name: string) {
  const value = form.get(name);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`ফর্মে ${name} তথ্যটি পাওয়া যায়নি। পেজ রিফ্রেশ করে আবার চেষ্টা করো।`);
  }
  return value;
}

function youtubeEmbedUrl(videoUrl: string) {
  try {
    const url = new URL(videoUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";
    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      videoId = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] ?? "";
    }
    return /^[A-Za-z0-9_-]{11}$/.test(videoId)
      ? `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&playsinline=1&iv_load_policy=3`
      : null;
  } catch {
    return null;
  }
}

function VideoPlayer({ videoUrl, title }: { videoUrl: string; title: string }) {
  const embedUrl = youtubeEmbedUrl(videoUrl);
  return embedUrl ? (
    <iframe
      className="embedded-video-player"
      src={embedUrl}
      title={`${title} ভিডিও`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  ) : (
    <video controls playsInline preload="metadata" controlsList="nodownload" aria-label={`${title} ভিডিও`}>
      <source src={videoUrl} />
      এই ব্রাউজারে ভিডিও চালানো যাচ্ছে না।
    </video>
  );
}

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem("lms-token") ?? "");
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [progress, setProgress] = useState<ProgressBatch[]>([]);
  const [page, setPage] = useState<"courses" | "progress" | "profile" | "courseDetails" | "assignments" | "liveClasses">("courses");
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [teacherPage, setTeacherPage] = useState<TeacherPage>("overview");
  const [adminPage, setAdminPage] = useState<AdminPage>("overview");
  const [adminTeachers, setAdminTeachers] = useState<AdminTeacher[]>([]);
  const [adminStudents, setAdminStudents] = useState<AdminStudent[]>([]);
  const [adminRosterLoading, setAdminRosterLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [authView, setAuthView] = useState<AuthView>("login");
  const [authStarted, setAuthStarted] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [deletingCourseId, setDeletingCourseId] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function applyDashboardRoute(pathname: string, role = user?.role) {
    if (!role) return;
    let route: string;
    if (role === "SUPER_ADMIN") {
      const routes: Record<string, AdminPage> = {
        "/admin": "overview",
        "/admin/teachers": "teachers",
        "/admin/courses": "courses",
        "/admin/students": "students",
      };
      const adminPageForRoute = routes[pathname];
      route = adminPageForRoute ? pathname : "/admin";
      setAdminPage(adminPageForRoute ?? "overview");
    } else if (role === "TEACHER") {
      const routes: Record<string, TeacherPage> = {
        "/teacher": "overview",
        "/teacher/courses": "courses",
        "/teacher/classes": "classes",
        "/teacher/students": "students",
      };
      const teacherPageForRoute = routes[pathname];
      route = teacherPageForRoute ? pathname : "/teacher";
      setTeacherPage(teacherPageForRoute ?? "overview");
    } else {
      const courseDetailsMatch = pathname.match(/^\/student\/course-details\/([0-9a-f-]{36})$/i);
      const routes = ["/student", "/student/courses", "/student/progress", "/student/profile", "/student/assignments", "/student/live-classes"];
      route = courseDetailsMatch || routes.includes(pathname) ? pathname : "/student/courses";
      if (courseDetailsMatch) {
        const course = courses.find((item) => item.id === courseDetailsMatch[1]);
        if (course) setSelectedCourse(course);
        setPage("courseDetails");
      } else {
        setPage(route === "/student/profile" ? "profile" : route === "/student/progress" ? "progress" : route === "/student/assignments" ? "assignments" : route === "/student/live-classes" ? "liveClasses" : "courses");
      }
    }
    if (window.location.pathname !== route) window.history.replaceState({}, "", route);
  }

  function navigateTo(pathname: string) {
    if (window.location.pathname !== pathname) window.history.pushState({}, "", pathname);
    applyDashboardRoute(pathname);
    setError("");
    setNotice("");
  }

  function clearSession() {
    sessionStorage.removeItem("lms-token");
    setToken("");
    setUser(null);
    setStudentProfile(null);
    setProfileReady(false);
    setAuthStarted(false);
    setCourses([]);
    setSelectedCourse(null);
    setSelectedBatch(null);
    setFolders([]);
    setHomework([]);
    setProgress([]);
  }

  async function loadCourses(authToken = token) {
    const result = await api<{ courses: Course[] }>("/courses", { token: authToken });
    setCourses(result.courses);
    return result.courses;
  }

  async function loadAdminStudents(authToken = token) {
    const result = await api<{ students: AdminStudent[] }>("/admin/students", { token: authToken });
    setAdminStudents(result.students);
    return result.students;
  }

  async function loadAdminTeachers(authToken = token) {
    const result = await api<{ teachers: AdminTeacher[] }>("/admin/teachers", { token: authToken });
    setAdminTeachers(result.teachers);
    return result.teachers;
  }

  async function loadBatch(batch: Batch, authToken = token) {
    setSelectedBatch(batch);
    setError("");
    try {
      const [folderResult, homeworkResult] = await Promise.all([
        api<{ folders: Folder[] }>(`/batches/${batch.id}/folders`, { token: authToken }),
        api<{ homework: Homework[] }>(`/batches/${batch.id}/homework`, { token: authToken }),
      ]);
      const homeworkById = new Map(homeworkResult.homework.map((item) => [item.id, item]));
      setFolders(folderResult.folders.map((folder) => ({
        ...folder,
        homework: folder.homework.map((item) => homeworkById.get(item.id) ?? item),
      })));
      setHomework(homeworkResult.homework);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this batch.");
      setFolders([]);
      setHomework([]);
    }
  }

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    api<{ user: User }>("/auth/me", { token })
      .then(async ({ user: currentUser }) => {
        if (!active) return;
        setUser(currentUser);
        if (currentUser.role === "STUDENT") {
          const result = await api<{ profile: StudentProfile; complete: boolean }>("/profile", { token });
          if (!active) return;
          setStudentProfile(result.profile);
          setProfileReady(true);
        } else {
          setProfileReady(true);
        }
        const items = await loadCourses(token);
        if (!active) return;
        if (items.length) {
          const routeCourseId = window.location.pathname.match(/^\/student\/course-details\/([0-9a-f-]{36})$/i)?.[1];
          const first = items.find((course) => course.id === routeCourseId) ?? items[0]!;
          setSelectedCourse(first);
          const batch = first.batch ?? first.batches?.[0];
          if (batch) await loadBatch(batch, token);
        }
      })
      .catch(() => {
        if (active) clearSession();
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!user) return;
    const syncRoute = () => applyDashboardRoute(window.location.pathname, user.role);
    syncRoute();
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== "SUPER_ADMIN" || (adminPage !== "teachers" && adminPage !== "students")) return;
    let active = true;
    setAdminRosterLoading(true);
    const request = adminPage === "teachers"
      ? loadAdminTeachers(token)
      : loadAdminStudents(token);
    request.catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "তালিকা লোড করা যায়নি।");
    }).finally(() => {
      if (active) setAdminRosterLoading(false);
    });
    return () => {
      active = false;
    };
  }, [token, user?.role, adminPage]);

  async function refreshCourses() {
    const items = await loadCourses();
    const latest = items.find((course) => course.id === selectedCourse?.id);
    if (latest) setSelectedCourse(latest);
    else if (!selectedCourse && items.length) setSelectedCourse(items[0]!);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (authView === "register" || authView === "reset") {
        const password = requiredFormValue(form, "password");
        const confirmPassword = requiredFormValue(form, "confirmPassword");
        if (password !== confirmPassword) {
          throw new Error("দুটি পাসওয়ার্ড মিলছে না। আবার মিলিয়ে লিখুন।");
        }
      }

      if (authView === "register") {
        const result = await api<{ token: string; user: User }>("/auth/register", {
          method: "POST",
          body: {
            name: requiredFormValue(form, "name"),
            email: requiredFormValue(form, "email"),
            password: requiredFormValue(form, "password"),
          },
        });
        sessionStorage.setItem("lms-token", result.token);
        setToken(result.token);
        setUser(result.user);
        setNotice("অ্যাকাউন্ট তৈরি হয়েছে। শেখা শুরু করো!");
      } else if (authView === "forgot") {
        const email = requiredFormValue(form, "email");
        await api<{ message: string }>("/auth/forgot-password", {
          method: "POST",
          body: { email },
        });
        setResetEmail(email);
        setAuthView("reset");
        setNotice("If an account exists for that email, reset instructions will be sent.");
      } else if (authView === "reset") {
        await api<{ message: string }>("/auth/reset-password", {
          method: "POST",
          body: {
            email: requiredFormValue(form, "email"),
            otp: requiredFormValue(form, "otp"),
            password: requiredFormValue(form, "password"),
          },
        });
        setAuthView("login");
        setNotice("Password reset successfully. Sign in with your new password.");
      } else {
        const result = await api<{ token: string; user: User }>("/auth/login", {
          method: "POST",
          body: {
            email: requiredFormValue(form, "email"),
            password: requiredFormValue(form, "password"),
          },
        });
        sessionStorage.setItem("lms-token", result.token);
        setToken(result.token);
        setUser(result.user);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST", token });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not log out.");
    } finally {
      clearSession();
    }
  }

  async function submitAction(
    event: FormEvent<HTMLFormElement>,
    action: (form: FormData) => Promise<void>,
    success: string,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    setError("");
    setNotice("");
    try {
      await action(formData);
      setNotice(success);
      formElement.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The request could not be completed.");
    }
  }

  async function showProgress() {
    navigateTo("/student/progress");
    try {
      const result = await api<{ batches: ProgressBatch[] }>("/progress/me", { token });
      setProgress(result.batches);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load progress.");
    }
  }

  async function saveStudentProfile(form: FormData) {
    const result = await api<{ profile: StudentProfile }>("/profile", {
      method: "PATCH",
      token,
      body: {
        name: requiredFormValue(form, "name"),
        phone: requiredFormValue(form, "phone"),
        fatherName: requiredFormValue(form, "fatherName"),
        motherName: requiredFormValue(form, "motherName"),
        className: requiredFormValue(form, "className"),
      },
    });
    setStudentProfile(result.profile);
    setUser((current) => current ? { ...current, name: result.profile.name } : current);
    setProfileReady(true);
    navigateTo("/student/courses");
    setNotice("তোমার প্রোফাইল সংরক্ষণ হয়েছে।");
  }

  if (!token || !user) {
    if (!token && !authStarted) {
      return (
        <LandingPage
          onLogin={() => {
            setAuthView("login");
            setAuthStarted(true);
          }}
          onRegister={() => {
            setAuthView("register");
            setAuthStarted(true);
          }}
        />
      );
    }

    return (
      <AuthScreen
        view={authView}
        loading={loading}
        error={error}
        notice={notice}
        resetEmail={resetEmail}
        onSubmit={submitAuth}
        onBackToHome={() => {
          setAuthStarted(false);
          setError("");
          setNotice("");
        }}
        onChangeView={(view) => {
          setAuthView(view);
          setError("");
          setNotice("");
        }}
      />
    );
  }

  if (user.role === "STUDENT" && !profileReady) {
    return <main className="profile-onboarding"><div className="profile-card"><p className="eyebrow">প্রোফাইল প্রস্তুত হচ্ছে</p><h1>একটু অপেক্ষা করো</h1><p>তোমার প্রোফাইলের তথ্য আনা হচ্ছে।</p></div></main>;
  }

  if (user.role === "STUDENT" && studentProfile && !isProfileComplete(studentProfile)) {
    return (
      <main className="profile-onboarding">
        <section className="profile-card">
          <span className="profile-card-icon">✦</span>
          <p className="eyebrow">শেখা শুরু করার আগে</p>
          <h1>তোমার প্রোফাইল সম্পূর্ণ করো</h1>
          <p>ক্লাস অনুযায়ী শেখার অভিজ্ঞতা ঠিক রাখতে তোমার ও অভিভাবকের তথ্য দাও। পরে প্রোফাইল থেকে তথ্য আপডেট করতে পারবে।</p>
          {(error || notice) && <div className={`alert ${error ? "alert-error" : "alert-success"}`}>{error || notice}</div>}
          <StudentProfileForm profile={studentProfile} onSubmit={(event) => {
            event.preventDefault();
            setError("");
            void saveStudentProfile(new FormData(event.currentTarget)).catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : "প্রোফাইল সংরক্ষণ করা যায়নি।");
            });
          }} />
        </section>
      </main>
    );
  }

  if (user.role === "STUDENT") {
    return (
      <StudentPortal
        user={user}
        token={token}
        courses={courses}
        selectedCourse={selectedCourse}
        selectedBatch={selectedBatch}
        availableBatches={selectedCourse ? selectedCourse.batches ?? (selectedCourse.batch ? [selectedCourse.batch] : []) : []}
        folders={folders}
        homework={homework}
        progress={progress}
        page={page}
        profile={studentProfile}
        error={error}
        notice={notice}
        onDismiss={() => { setError(""); setNotice(""); }}
        onLogout={logout}
        onSelectCourse={chooseCourse}
        onSelectBatch={(batch) => void loadBatch(batch)}
        onShowCourses={() => navigateTo("/student/courses")}
        onShowCourseDetails={openCourseDetails}
        onShowProgress={showProgress}
        onShowAssignments={() => navigateTo("/student/assignments")}
        onShowLiveClasses={() => navigateTo("/student/live-classes")}
        onShowProfile={() => navigateTo("/student/profile")}
        onRefreshBatch={() => selectedBatch && void loadBatch(selectedBatch)}
        onError={setError}
        onNotice={setNotice}
        onProfileSubmit={(event) => void submitAction(event, saveStudentProfile, "প্রোফাইল আপডেট হয়েছে।")}
      />
    );
  }

  const availableBatches = selectedCourse
    ? selectedCourse.batches ?? (selectedCourse.batch ? [selectedCourse.batch] : [])
    : [];
  const teacherSummary = user.role === "TEACHER"
    ? courses.reduce((summary, course) => {
      const batches = course.batches ?? (course.batch ? [course.batch] : []);
      return {
        classes: summary.classes + batches.length,
        students: summary.students + batches.reduce((total, batch) => total + (batch._count?.enrollments ?? 0), 0),
      };
    }, { classes: 0, students: 0 })
    : null;
  const adminSummary = user.role === "SUPER_ADMIN"
    ? courses.reduce((summary, course) => {
      const batches = course.batches ?? (course.batch ? [course.batch] : []);
      return {
        classes: summary.classes + batches.length,
        students: summary.students + batches.reduce((total, batch) => total + (batch._count?.enrollments ?? 0), 0),
      };
    }, { classes: 0, students: 0 })
    : null;
  const normalizedStudentSearch = studentSearch.trim().toLocaleLowerCase();
  const filteredAdminStudents = adminStudents.filter((student) => {
    if (!normalizedStudentSearch) return true;
    const searchable = [
      student.name,
      student.email,
      student.phone,
      student.fatherName,
      student.motherName,
      student.className,
      ...student.enrollments.flatMap(({ batch }) => [batch.name, batch.course.title]),
    ];
    return searchable.some((value) => value?.toLocaleLowerCase().includes(normalizedStudentSearch));
  });

  function chooseCourse(course: Course) {
    setSelectedCourse(course);
    setFolders([]);
    setHomework([]);
    const firstBatch = course.batch ?? course.batches?.[0];
    if (firstBatch) void loadBatch(firstBatch);
    else setSelectedBatch(null);
  }

  function openCourseDetails(course: Course) {
    chooseCourse(course);
    navigateTo(`/student/course-details/${course.id}`);
  }

  async function deleteCourse(course: Course) {
    const confirmed = window.confirm(
      `“${course.title}” কোর্সটি মুছে ফেললে এর সব ক্লাস, পাঠ, অ্যাসাইনমেন্ট, জমা দেওয়া কাজ ও শিক্ষার্থীদের অগ্রগতির তথ্যও স্থায়ীভাবে মুছে যাবে। আপনি কি নিশ্চিত?`,
    );
    if (!confirmed) return;

    setDeletingCourseId(course.id);
    setError("");
    setNotice("");
    try {
      await api(`/courses/${course.id}`, { method: "DELETE", token });
      const remainingCourses = courses.filter((item) => item.id !== course.id);
      setCourses(remainingCourses);
      if (selectedCourse?.id === course.id) {
        if (remainingCourses[0]) {
          chooseCourse(remainingCourses[0]);
        } else {
          setSelectedCourse(null);
          setSelectedBatch(null);
          setFolders([]);
          setHomework([]);
        }
      }
      setNotice("কোর্স এবং এর সংশ্লিষ্ট সব তথ্য মুছে ফেলা হয়েছে।");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "কোর্সটি মুছে ফেলা যায়নি।");
    } finally {
      setDeletingCourseId("");
    }
  }

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <a className="brand" href="#" onClick={(event) => event.preventDefault()}>
          <span className="brand-mark">C</span>
          <span>classroom<span className="brand-dot">.</span></span>
        </a>
        <p className="sidebar-section-label">{user.role === "TEACHER" ? "শিক্ষক মেনু" : "সুপার অ্যাডমিন"}</p>
        <nav className="dashboard-nav" aria-label="প্রধান নেভিগেশন">
          {user.role === "SUPER_ADMIN" && (
            <>
              <button className={`dashboard-nav-link ${adminPage === "overview" ? "active" : ""}`} onClick={() => navigateTo("/admin")}>
                <span>⌂</span> ড্যাশবোর্ড
              </button>
              <button className={`dashboard-nav-link ${adminPage === "teachers" ? "active" : ""}`} onClick={() => navigateTo("/admin/teachers")}>
                <span>♙</span> শিক্ষক
              </button>
              <button className={`dashboard-nav-link ${adminPage === "courses" ? "active" : ""}`} onClick={() => navigateTo("/admin/courses")}>
                <span>▦</span> কোর্স ও ক্লাস
              </button>
              <button className={`dashboard-nav-link ${adminPage === "students" ? "active" : ""}`} onClick={() => navigateTo("/admin/students")}>
                <span>♧</span> শিক্ষার্থী
              </button>
            </>
          )}
          {user.role === "TEACHER" && (
            <button className={`dashboard-nav-link ${teacherPage === "overview" ? "active" : ""}`} onClick={() => navigateTo("/teacher")}>
              <span>⌂</span> ড্যাশবোর্ড
            </button>
          )}
          {user.role === "TEACHER" && (
            <button className={`dashboard-nav-link ${teacherPage === "courses" ? "active" : ""}`} onClick={() => navigateTo("/teacher/courses")}>
              <span>▦</span> আমার কোর্স
            </button>
          )}
          {user.role === "TEACHER" && (
            <>
              <button className={`dashboard-nav-link ${teacherPage === "classes" ? "active" : ""}`} onClick={() => navigateTo("/teacher/classes")}>
                <span>▤</span> ক্লাস ও লেসন
              </button>
              <button className={`dashboard-nav-link ${teacherPage === "students" ? "active" : ""}`} onClick={() => navigateTo("/teacher/students")}>
                <span>♧</span> শিক্ষার্থী যুক্ত
              </button>
            </>
          )}
        </nav>
        <div className="dashboard-sidebar-bottom">
          <div className="sidebar-help">
            <span>✦</span>
            <strong>{user.role === "TEACHER" ? "শেখানো হোক আনন্দের" : "শেখার পরিসর গড়ে তোলো"}</strong>
            <p>{user.role === "TEACHER" ? "তোমার পরের লেসনটি শিক্ষার্থীদের আরও এগিয়ে নেবে।" : "শিক্ষক ও শিক্ষার্থীদের জন্য গুছানো ক্লাসরুম তৈরি করো।"}</p>
          </div>
          <div className="sidebar-profile">
            <span className="top-avatar">{user.name.charAt(0).toUpperCase()}</span>
            <span className="dashboard-account-copy"><strong>{user.name}</strong><small>{roleLabel(user.role)}</small></span>
            <button className="dashboard-logout" onClick={logout} aria-label="লগ-আউট" title="লগ-আউট">↗</button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="dashboard-topbar">
          <div><span className="topbar-mark">✦</span> {user.role === "TEACHER" ? "তোমার ক্লাসরুম, তোমার নিয়মে" : "লার্নিং স্পেস পরিচালনা"}</div>
          <span className="topbar-role"><i /> {roleLabel(user.role)}</span>
        </header>
        <section className={`page-content ${(user.role === "TEACHER" && teacherPage !== "overview") || (user.role === "SUPER_ADMIN" && adminPage !== "overview") ? "teacher-subpage" : ""}`}>
          {((user.role === "TEACHER" && teacherPage === "overview") || (user.role === "SUPER_ADMIN" && adminPage === "overview")) && (
            <div className="welcome-row dashboard-hero">
              <div className="dashboard-hero-copy">
                <p className="eyebrow">{user.role === "TEACHER" ? "শিক্ষক ড্যাশবোর্ড" : "প্রশাসন"}</p>
                <h1>{dashboardGreeting(user.name)}</h1>
                <p className="page-subtitle">
                  {user.role === "TEACHER"
                    ? "কোর্স, ক্লাস আর শিক্ষার্থীদের শেখার কার্যক্রম এক জায়গা থেকে পরিচালনা করো।"
                    : "শিক্ষক, কোর্স ও শিক্ষার্থীদের কার্যক্রম এক জায়গা থেকে পরিচালনা করো।"}
                </p>
                <span className="dashboard-date"><i /> {user.role === "TEACHER" ? "তোমার ক্লাসরুম প্রস্তুত" : "সব কার্যক্রম এক নজরে"}</span>
              </div>
              <div className="dashboard-hero-art" aria-hidden="true">
                <span className="dashboard-art-sun" />
                <span className="dashboard-art-book">▤</span>
                <span className="dashboard-art-spark spark-a">✦</span>
                <span className="dashboard-art-spark spark-b">✧</span>
                <span className="dashboard-art-note">চলো, শুরু করি!</span>
              </div>
            </div>
          )}

          {(error || notice) && (
            <div className={`alert ${error ? "alert-error" : "alert-success"}`} role="status">
              {error || notice}
              <button onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss">×</button>
            </div>
          )}

          {user.role === "TEACHER" ? (
            <>
              {teacherPage !== "overview" && (
                <div className="teacher-page-heading">
                  <p className="eyebrow">শিক্ষক মেনু</p>
                  <h1>{teacherPage === "courses" ? "আমার কোর্স" : teacherPage === "classes" ? "ক্লাস ও লেসন" : "শিক্ষার্থী যুক্ত করুন"}</h1>
                  <p>{teacherPage === "courses"
                    ? "কোর্স তৈরি ও পরিচালনা করো।"
                    : teacherPage === "classes"
                      ? "ক্লাস বেছে নিয়ে লেসন, ফোল্ডার ও অ্যাসাইনমেন্ট গুছিয়ে নাও।"
                      : "কোর্স এবং ক্লাস বেছে শিক্ষার্থীকে যুক্ত করো।"}</p>
                </div>
              )}
              {teacherPage === "overview" && teacherSummary && (
                <section className="teacher-overview" aria-label="শিক্ষাদানের সারাংশ">
                  <div className="teacher-overview-heading">
                    <div><p className="eyebrow">এক নজরে</p><h2>শিক্ষাদানের সারাংশ</h2></div>
                    <span>তোমার কোর্সের বর্তমান হিসাব</span>
                  </div>
                  <div className="teacher-stats">
                    <StatCard label="আমার কোর্স" value={formatNumber(courses.length)} icon="▤" color="mint" />
                    <StatCard label="মোট ক্লাস" value={formatNumber(teacherSummary.classes)} icon="▦" color="lavender" />
                    <StatCard label="যুক্ত শিক্ষার্থী" value={formatNumber(teacherSummary.students)} icon="♧" color="peach" />
                  </div>
                </section>
              )}
              {teacherPage === "courses" && (
                <>
                  <div className="teacher-create-panel">
                    <div><p className="eyebrow">নতুন কোর্স</p><h2>কোর্স তৈরি করো</h2></div>
                    <form
                      className="teacher-course-form"
                      onSubmit={(event) => void submitAction(event, async (form) => {
                        await api("/courses", {
                          method: "POST",
                          token,
                          body: { title: form.get("title"), description: form.get("description") || undefined },
                        });
                        await refreshCourses();
                      }, "কোর্স তৈরি হয়েছে।")}
                    >
                      <input name="title" placeholder="কোর্সের নাম" required maxLength={200} aria-label="কোর্সের নাম" />
                      <input name="description" placeholder="কোর্সের বিবরণ (ঐচ্ছিক)" maxLength={5000} aria-label="কোর্সের বিবরণ" />
                      <button className="button button-primary" type="submit">＋ কোর্স তৈরি</button>
                    </form>
                  </div>
                  <div className="section-heading dashboard-section-heading">
                    <div><p className="eyebrow">তোমার কোর্স</p><h2>কোর্স তালিকা</h2><p>{formatNumber(courses.length)}টি কোর্স</p></div>
                  </div>
                  {courses.length ? (
                    <div className="course-grid">
                      {courses.map((course, index) => (
                        <CourseCard
                          key={course.id}
                          course={course}
                          index={index}
                          selected={selectedCourse?.id === course.id}
                          onClick={() => chooseCourse(course)}
                          onDelete={() => void deleteCourse(course)}
                          deleting={deletingCourseId === course.id}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon="▤" title="এখনো কোনো কোর্স নেই" text="উপরের ফর্ম থেকে তোমার প্রথম কোর্সটি তৈরি করো।" />
                  )}
                </>
              )}
              {teacherPage === "classes" && (
                <>
                  {courses.length ? (
                    <>
                      <label className="teacher-selector">কোর্স বেছে নাও
                        <select
                          value={selectedCourse?.id ?? ""}
                          onChange={(event) => {
                            const course = courses.find((item) => item.id === event.target.value);
                            if (course) chooseCourse(course);
                          }}
                        >
                          {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
                        </select>
                      </label>
                      {selectedCourse && (
                        <>
                          <div className="classroom-section teacher-class-workspace">
                            <div className="section-heading section-heading-lower">
                              <div><p className="eyebrow">কোর্স স্পেস</p><h2>{selectedCourse.title}</h2></div>
                              <form
                                className="inline-create"
                                onSubmit={(event) => void submitAction(event, async (form) => {
                                  await api(`/courses/${selectedCourse.id}/batches`, {
                                    method: "POST",
                                    token,
                                    body: { name: form.get("name") },
                                  });
                                  await refreshCourses();
                                }, "ক্লাস তৈরি হয়েছে।")}
                              >
                                <input name="name" placeholder="ক্লাসের নাম" required maxLength={120} aria-label="ক্লাসের নাম" />
                                <button className="button button-outline" type="submit">＋ ক্লাস যোগ</button>
                              </form>
                            </div>
                            {availableBatches.length ? (
                              <>
                                <div className="batch-tabs">
                                  {availableBatches.map((batch) => (
                                    <button className={`batch-tab ${selectedBatch?.id === batch.id ? "active" : ""}`} key={batch.id} onClick={() => void loadBatch(batch)}>
                                      <span className="batch-tab-icon">▤</span>{batch.name}
                                      {batch._count && <span className="student-count">{formatNumber(batch._count.enrollments)} জন শিক্ষার্থী</span>}
                                    </button>
                                  ))}
                                </div>
                                {selectedBatch && (
                                  <BatchView user={user} token={token} batch={selectedBatch} folders={folders} homework={homework}
                                    onRefresh={() => void loadBatch(selectedBatch)} onError={setError} onNotice={setNotice} />
                                )}
                              </>
                            ) : (
                              <EmptyState icon="▤" title="এই কোর্সে এখনো ক্লাস নেই" text="ক্লাস তৈরি করতে উপরের ফর্মটি ব্যবহার করো।" />
                            )}
                          </div>
                          <CourseChat courseId={selectedCourse.id} courseTitle={selectedCourse.title} user={user} token={token} />
                        </>
                      )}
                    </>
                  ) : (
                    <EmptyState icon="▤" title="আগে একটি কোর্স তৈরি করো" text="ক্লাস ও লেসন যোগ করার আগে কোর্স তৈরি করতে হবে।" />
                  )}
                </>
              )}
              {teacherPage === "students" && (
                <section className="teacher-enrollment-panel">
                  <div className="teacher-enrollment-heading">
                    <span className="teacher-enrollment-icon">♧</span>
                    <div><h2>শিক্ষার্থীকে ক্লাসে যুক্ত করো</h2><p>নিবন্ধিত শিক্ষার্থীর ইমেইল দিয়ে নির্দিষ্ট ক্লাসে অ্যাক্সেস দাও।</p></div>
                  </div>
                  {courses.length ? (
                    <>
                      <div className="teacher-selectors">
                        <label className="teacher-selector">কোর্স
                          <select
                            value={selectedCourse?.id ?? ""}
                            onChange={(event) => {
                              const course = courses.find((item) => item.id === event.target.value);
                              if (course) chooseCourse(course);
                            }}
                          >
                            {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
                          </select>
                        </label>
                        <label className="teacher-selector">ক্লাস
                          <select
                            value={availableBatches.some((batch) => batch.id === selectedBatch?.id) ? selectedBatch?.id : ""}
                            onChange={(event) => {
                              const batch = availableBatches.find((item) => item.id === event.target.value);
                              if (batch) void loadBatch(batch);
                            }}
                            disabled={!availableBatches.length}
                          >
                            {availableBatches.length
                              ? availableBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)
                              : <option value="">এই কোর্সে কোনো ক্লাস নেই</option>}
                          </select>
                        </label>
                      </div>
                      {selectedBatch && availableBatches.some((batch) => batch.id === selectedBatch.id) ? (
                        <>
                          <form className="teacher-enrollment-form" onSubmit={(event) => void submitAction(event, async (form) => {
                            await api(`/batches/${selectedBatch.id}/enrollments`, {
                              method: "POST",
                              token,
                              body: { studentEmail: form.get("studentEmail") },
                            });
                            await refreshCourses();
                          }, "শিক্ষার্থীকে ক্লাসে যুক্ত করা হয়েছে।")}>
                            <label>শিক্ষার্থীর নিবন্ধিত ইমেইল
                              <input name="studentEmail" type="email" placeholder="student@example.com" required />
                            </label>
                            <button className="button button-primary" type="submit">ক্লাসে যুক্ত করুন <span>→</span></button>
                          </form>
                          <p className="admin-hint">শিক্ষার্থীকে আগে এই একই localhost অ্যাপে নিবন্ধন করতে হবে। অন্য সার্ভার/ওয়েবসাইটের অ্যাকাউন্ট এখানে পাওয়া যাবে না।</p>
                        </>
                      ) : (
                        <EmptyState icon="▤" title="এই কোর্সে কোনো ক্লাস নেই" text="শিক্ষার্থী যুক্ত করতে আগে ক্লাস ও লেসন মেনু থেকে একটি ক্লাস তৈরি করো।" />
                      )}
                    </>
                  ) : (
                    <EmptyState icon="▤" title="আগে কোর্স ও ক্লাস তৈরি করো" text="শিক্ষার্থীকে যুক্ত করার আগে একটি কোর্স ও ক্লাস তৈরি করো।" />
                  )}
                </section>
              )}
            </>
          ) : user.role === "SUPER_ADMIN" ? (
            <>
              {adminPage !== "overview" && (
                <div className="teacher-page-heading">
                  <p className="eyebrow">সুপার অ্যাডমিন</p>
                  <h1>{adminPage === "teachers" ? "শিক্ষক পরিচালনা" : adminPage === "courses" ? "কোর্স ও ক্লাস" : "শিক্ষার্থী পরিচালনা"}</h1>
                  <p>{adminPage === "teachers"
                    ? "শিক্ষক অ্যাকাউন্ট তৈরি করো বা নিবন্ধিত অ্যাকাউন্টকে শিক্ষক হিসেবে সেট করো।"
                    : adminPage === "courses"
                      ? "সব কোর্স, ক্লাস ও শেখার উপকরণ এক জায়গায় দেখো।"
                      : "কোর্স ও ক্লাস বেছে নিবন্ধিত শিক্ষার্থীকে অ্যাক্সেস দাও।"}</p>
                </div>
              )}
              {adminPage === "overview" && adminSummary && (
                <>
                  <section className="teacher-overview admin-overview" aria-label="প্রশাসনিক সারাংশ">
                    <div className="teacher-overview-heading">
                      <div><p className="eyebrow">এক নজরে</p><h2>লার্নিং স্পেসের সারাংশ</h2></div>
                      <span>বর্তমান ডাটাবেসের হিসাব</span>
                    </div>
                    <div className="teacher-stats">
                      <StatCard label="মোট কোর্স" value={formatNumber(courses.length)} icon="▤" color="mint" />
                      <StatCard label="মোট ক্লাস" value={formatNumber(adminSummary.classes)} icon="▦" color="lavender" />
                      <StatCard label="ক্লাসে যুক্ত শিক্ষার্থী" value={formatNumber(adminSummary.students)} icon="♧" color="peach" />
                    </div>
                  </section>
                  <div className="admin-shortcuts" aria-label="দ্রুত কাজ">
                    <button className="admin-shortcut" onClick={() => navigateTo("/admin/teachers")}>
                      <span className="admin-shortcut-icon lavender">♙</span>
                      <span><strong>শিক্ষক যোগ</strong><small>নতুন শিক্ষক অ্যাকাউন্ট তৈরি করো</small></span>
                      <b>→</b>
                    </button>
                    <button className="admin-shortcut" onClick={() => navigateTo("/admin/courses")}>
                      <span className="admin-shortcut-icon mint">▦</span>
                      <span><strong>কোর্স ও ক্লাস</strong><small>{formatNumber(courses.length)}টি কোর্স দেখো</small></span>
                      <b>→</b>
                    </button>
                    <button className="admin-shortcut" onClick={() => navigateTo("/admin/students")}>
                      <span className="admin-shortcut-icon peach">♧</span>
                      <span><strong>শিক্ষার্থী যুক্ত</strong><small>নির্দিষ্ট ক্লাসে অ্যাক্সেস দাও</small></span>
                      <b>→</b>
                    </button>
                  </div>
                </>
              )}
              {adminPage === "teachers" && (
                <section className="admin-panel admin-teacher-panel">
                  <div className="admin-teacher-intro">
                    <span className="admin-shortcut-icon lavender">♙</span>
                    <div><p className="eyebrow">অ্যাকাউন্ট</p><h2>শিক্ষক যোগ করুন</h2><p>নতুন শিক্ষক তৈরি করো, অথবা আগে শিক্ষার্থী হিসেবে নিবন্ধিত অ্যাকাউন্টকে শিক্ষক বানাও।</p></div>
                  </div>
                  <form
                    className="admin-create-form"
                    onSubmit={(event) => void submitAction(event, async (form) => {
                      await api("/admin/teachers", {
                        method: "POST",
                        token,
                        body: {
                          name: requiredFormValue(form, "name"),
                          email: requiredFormValue(form, "email"),
                          password: requiredFormValue(form, "password"),
                        },
                      });
                      await loadAdminTeachers();
                    }, "শিক্ষক অ্যাকাউন্ট তৈরি বা আপডেট হয়েছে।")}
                  >
                    <input name="name" placeholder="শিক্ষকের নাম" required maxLength={120} />
                    <input name="email" type="email" placeholder="শিক্ষকের ইমেইল" required />
                    <input
                      name="password"
                      type="password"
                      placeholder="শক্তিশালী পাসওয়ার্ড তৈরি করুন"
                      minLength={16}
                      maxLength={128}
                      pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{16,128}"
                      title="Use 16+ characters with uppercase, lowercase, a number, and a symbol."
                      autoComplete="new-password"
                      required
                    />
                    <button className="button button-primary" type="submit">＋ শিক্ষক যোগ করুন</button>
                  </form>
                  <p className="admin-hint">পাসওয়ার্ডে কমপক্ষে ১৬টি অক্ষর, বড় ও ছোট হাতের অক্ষর, সংখ্যা এবং একটি চিহ্ন রাখুন।</p>
                  <div className="admin-roster-heading"><h2>শিক্ষক তালিকা</h2><span>{formatNumber(adminTeachers.length)} জন</span></div>
                  {adminRosterLoading ? <p className="admin-hint">তালিকা লোড হচ্ছে...</p> : adminTeachers.length ? (
                    <div className="admin-roster-list">
                      {adminTeachers.map((teacher) => (
                        <article className="admin-roster-card" key={teacher.id}>
                          <span className="roster-avatar">{teacher.name.charAt(0).toUpperCase()}</span>
                          <div><strong>{teacher.name}</strong><small>{teacher.email}</small></div>
                          <span className="roster-tag">{formatNumber(teacher._count.courses)} কোর্স</span>
                        </article>
                      ))}
                    </div>
                  ) : <EmptyState icon="♙" title="এখনো শিক্ষক নেই" text="উপরের একটিমাত্র ফর্ম থেকে শিক্ষক যোগ করো।" />}
                </section>
              )}
              {adminPage === "courses" && (
                <>
                  <div className="section-heading dashboard-section-heading">
                    <div><p className="eyebrow">পরিচালনা</p><h2>সব কোর্স</h2><p>{formatNumber(courses.length)}টি কোর্স</p></div>
                  </div>
                  {courses.length ? (
                    <div className="course-grid">
                      {courses.map((course, index) => (
                        <CourseCard
                          key={course.id}
                          course={course}
                          index={index}
                          selected={selectedCourse?.id === course.id}
                          onClick={() => chooseCourse(course)}
                          onDelete={() => void deleteCourse(course)}
                          deleting={deletingCourseId === course.id}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon="▤" title="এখনো কোনো কোর্স নেই" text="শিক্ষকরা কোর্স তৈরি করলে এখানে দেখা যাবে।" />
                  )}
                  {selectedCourse && (
                    <div className="classroom-section">
                      <div className="section-heading section-heading-lower">
                        <div><p className="eyebrow">কোর্স স্পেস</p><h2>{selectedCourse.title}</h2></div>
                      </div>
                      {availableBatches.length ? (
                        <>
                          <div className="batch-tabs">
                            {availableBatches.map((batch) => (
                              <button className={`batch-tab ${selectedBatch?.id === batch.id ? "active" : ""}`} key={batch.id} onClick={() => void loadBatch(batch)}>
                                <span className="batch-tab-icon">▤</span>{batch.name}
                                {batch._count && <span className="student-count">{formatNumber(batch._count.enrollments)} জন শিক্ষার্থী</span>}
                              </button>
                            ))}
                          </div>
                          {selectedBatch && <BatchView user={user} token={token} batch={selectedBatch} folders={folders} homework={homework} onRefresh={() => void loadBatch(selectedBatch)} onError={setError} onNotice={setNotice} />}
                        </>
                      ) : (
                        <EmptyState icon="▤" title="এই কোর্সে কোনো ক্লাস নেই" text="শিক্ষক ক্লাস তৈরি করলে এখানে দেখা যাবে।" />
                      )}
                    </div>
                  )}
                </>
              )}
              {adminPage === "students" && (
                <section className="admin-student-management">
                  <div className="teacher-enrollment-panel admin-students-panel">
                    <div className="teacher-enrollment-heading">
                      <span className="teacher-enrollment-icon">♧</span>
                      <div><h2>শিক্ষার্থীকে ক্লাসে যুক্ত করো</h2><p>একবারে একটি কোর্সের ক্লাসে যুক্ত করো; শিক্ষার্থীর অ্যাকাউন্ট আগে তৈরি থাকতে হবে।</p></div>
                    </div>
                    {courses.length && courses.some((course) => (course.batches ?? (course.batch ? [course.batch] : [])).length) ? (
                      <form className="teacher-enrollment-form" onSubmit={(event) => void submitAction(event, async (form) => {
                        const batchId = requiredFormValue(form, "batchId");
                        await api(`/batches/${batchId}/enrollments`, {
                          method: "POST",
                          token,
                          body: { studentEmail: requiredFormValue(form, "studentEmail") },
                        });
                        try {
                          await Promise.all([loadAdminStudents(), refreshCourses()]);
                        } catch (cause) {
                          const detail = cause instanceof Error ? cause.message : "অজানা সমস্যা";
                          throw new Error(`শিক্ষার্থীকে ক্লাসে যুক্ত করা হয়েছে, কিন্তু তালিকা আপডেট করা যায়নি: ${detail}`);
                        }
                      }, "শিক্ষার্থীকে ক্লাসে যুক্ত করা হয়েছে।")}>
                        <label>কোর্স ও ক্লাস
                          <select name="batchId" required defaultValue="">
                            <option value="" disabled>কোর্স ও ক্লাস বেছে নাও</option>
                            {courses.flatMap((course) => (course.batches ?? (course.batch ? [course.batch] : [])).map((batch) => (
                              <option key={batch.id} value={batch.id}>{course.title} — {batch.name}</option>
                            )))}
                          </select>
                        </label>
                        <label>শিক্ষার্থীর নিবন্ধিত ইমেইল
                          <input name="studentEmail" type="email" placeholder="student@example.com" required />
                        </label>
                        <button className="button button-primary" type="submit">ক্লাসে যুক্ত করুন <span>→</span></button>
                      </form>
                    ) : <EmptyState icon="▤" title="কোনো ক্লাস নেই" text="শিক্ষার্থী যুক্ত করার আগে শিক্ষককে কোর্স ও ক্লাস তৈরি করতে হবে।" />}
                  </div>
                  <section className="admin-roster-section">
                    <div className="admin-roster-heading"><div><p className="eyebrow">শ্রেণি অনুযায়ী</p><h2>শিক্ষার্থী তালিকা</h2></div><span>{formatNumber(adminStudents.length)} জন নিবন্ধিত</span></div>
                    <label className="student-search">
                      <span aria-hidden="true">⌕</span>
                      <input
                        type="search"
                        value={studentSearch}
                        onChange={(event) => setStudentSearch(event.target.value)}
                        placeholder="নাম, ইমেইল, ফোন বা শ্রেণি দিয়ে খুঁজুন"
                        aria-label="শিক্ষার্থী খুঁজুন"
                      />
                    </label>
                    {adminRosterLoading ? <p className="admin-hint">তালিকা লোড হচ্ছে...</p> : adminStudents.length ? (
                      filteredAdminStudents.length ? [...new Set(filteredAdminStudents.map((student) => student.className || "শ্রেণি উল্লেখ নেই"))].map((className) => {
                        const classStudents = filteredAdminStudents.filter((student) => (student.className || "শ্রেণি উল্লেখ নেই") === className);
                        return (
                          <section className="student-class-group" key={className}>
                            <div className="student-class-heading">
                              <h3><span aria-hidden="true">▦</span>{className}</h3>
                              <span>{formatNumber(classStudents.length)} জন শিক্ষার্থী</span>
                            </div>
                            <div className="admin-roster-list">
                              {classStudents.map((student) => (
                                <details className="admin-student-card" key={student.id}>
                                  <summary className="admin-student-summary">
                                    <span className="roster-avatar">{student.name.charAt(0).toUpperCase()}</span>
                                    <div className="student-roster-details">
                                      <strong>{student.name}</strong><small>{student.email}</small>
                                    </div>
                                    <span className="student-enrollment-count">{formatNumber(student.enrollments.length)} ক্লাস</span>
                                    <span className="student-details-chevron" aria-hidden="true">⌄</span>
                                  </summary>
                                  <div className="admin-student-details">
                                    <div className="student-family-info">
                                      <span>ফোন <strong>{student.phone || "—"}</strong></span>
                                      <span>বাবা <strong>{student.fatherName || "—"}</strong></span>
                                      <span>মা <strong>{student.motherName || "—"}</strong></span>
                                    </div>
                                    {student.enrollments.length ? (
                                      <ul className="student-enrollment-list">
                                        {student.enrollments.map((enrollment) => (
                                          <li key={enrollment.id}>
                                            <span><strong>{enrollment.batch.course.title}</strong><small>{enrollment.batch.name}</small></span>
                                            <button className="button button-danger-outline" type="button" onClick={() => {
                                              if (!window.confirm(`${student.name}-কে “${enrollment.batch.name}” ক্লাস থেকে সরাতে চাও?`)) return;
                                              void api(`/batches/${enrollment.batch.id}/enrollments/${student.id}`, { method: "DELETE", token })
                                                .then(() => loadAdminStudents())
                                                .then(() => setNotice("শিক্ষার্থীকে ক্লাস থেকে সরানো হয়েছে।"))
                                                .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "শিক্ষার্থীকে সরানো যায়নি।"));
                                            }}>সরাও</button>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : <p className="admin-hint student-no-enrollment">এখনো কোনো কোর্স বা ক্লাসে যুক্ত নয়।</p>}
                                  </div>
                                </details>
                              ))}
                            </div>
                          </section>
                        );
                      }) : <EmptyState icon="⌕" title="কোনো শিক্ষার্থী মেলেনি" text="অন্য নাম, ইমেইল, ফোন বা শ্রেণি দিয়ে খুঁজে দেখো।" />
                    ) : <EmptyState icon="♧" title="এখনো শিক্ষার্থী নেই" text="শিক্ষার্থীরা অ্যাকাউন্ট তৈরি করলে তালিকায় দেখা যাবে।" />}
                  </section>
                </section>
              )}
            </>
          ) : page === "profile" && user.role === "STUDENT" && studentProfile ? (
            <section className="student-profile-page">
              <div className="teacher-page-heading">
                <p className="eyebrow">শিক্ষার্থী</p>
                <h1>আমার প্রোফাইল</h1>
                <p>তোমার ও অভিভাবকের তথ্য হালনাগাদ রাখো।</p>
              </div>
              <StudentProfileForm
                profile={studentProfile}
                onSubmit={(event) => void submitAction(event, saveStudentProfile, "প্রোফাইল আপডেট হয়েছে।")}
              />
            </section>
          ) : page === "progress" && user.role === "STUDENT" ? (
            <ProgressView progress={progress} />
          ) : (
            <>
              <div className="section-heading dashboard-section-heading" id="course-list">
                <div>
                  <p className="eyebrow">তোমার ক্লাসরুম</p>
                  <h2>{user.role === "STUDENT" ? "তোমার কোর্সগুলো" : "কোর্স ও ক্লাস"}</h2>
                  <p>{`${formatNumber(courses.length)}টি কোর্স · শেখা হোক আনন্দের`}</p>
                </div>
              </div>

              {courses.length === 0 ? (
                <EmptyState
                  icon="✳"
                  title={user.role === "STUDENT" ? "এখনো কোনো কোর্স নেই" : "এখনো কোনো কোর্স তৈরি করোনি"}
                  text={user.role === "STUDENT"
                    ? "কোনো ক্লাসে যুক্ত হলে তোমার কোর্সগুলো এখানে দেখতে পাবে।"
                    : "নতুন কোর্স তৈরি করে ক্লাস, লেসন এবং শিক্ষার্থীদের এক জায়গায় গুছিয়ে নাও।"}
                />
              ) : (
                <div className="course-grid">
                  {courses.map((course, index) => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      index={index}
                      selected={selectedCourse?.id === course.id}
                      onClick={() => chooseCourse(course)}
                    />
                  ))}
                </div>
              )}

              {selectedCourse && (
                <div className="classroom-section" id="course-space">
                  <div className="section-heading section-heading-lower">
                    <div>
                      <p className="eyebrow">কোর্স স্পেস</p>
                      <h2>{selectedCourse.title}</h2>
                    </div>
                  </div>

                  {availableBatches.length > 0 ? (
                    <>
                      <div className="batch-tabs">
                        {availableBatches.map((batch) => (
                          <button
                            className={`batch-tab ${selectedBatch?.id === batch.id ? "active" : ""}`}
                            key={batch.id}
                            onClick={() => void loadBatch(batch)}
                          >
                            <span className="batch-tab-icon">▤</span>
                            {batch.name}
                            {batch._count && <span className="student-count">{formatNumber(batch._count.enrollments)} জন শিক্ষার্থী</span>}
                          </button>
                        ))}
                      </div>
                      {selectedBatch && (
                        <BatchView
                          user={user}
                          token={token}
                          batch={selectedBatch}
                          folders={folders}
                          homework={homework}
                          onRefresh={() => void loadBatch(selectedBatch)}
                          onError={setError}
                          onNotice={setNotice}
                        />
                      )}
                    </>
                  ) : (
                    <EmptyState
                      icon="▤"
                      title="এই কোর্সে এখনো ক্লাস নেই"
                      text="ক্লাস যোগ হলে এখানে দেখতে পাবে।"
                    />
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </main>
      <footer className="footer dashboard-footer"><span>© ২০২৬ Classroom · শেখার আনন্দ সবার জন্য</span><span>প্রতিদিন একটু একটু করে এগিয়ে চলো <b>✦</b></span></footer>
    </div>
  );
}

function StudentPortal({
  user,
  token,
  courses,
  selectedCourse,
  selectedBatch,
  availableBatches,
  folders,
  homework,
  progress,
  page,
  profile,
  error,
  notice,
  onDismiss,
  onLogout,
  onSelectCourse,
  onSelectBatch,
  onShowCourses,
  onShowCourseDetails,
  onShowProgress,
  onShowAssignments,
  onShowLiveClasses,
  onShowProfile,
  onRefreshBatch,
  onError,
  onNotice,
  onProfileSubmit,
}: {
  user: User;
  token: string;
  courses: Course[];
  selectedCourse: Course | null;
  selectedBatch: Batch | null;
  availableBatches: Batch[];
  folders: Folder[];
  homework: Homework[];
  progress: ProgressBatch[];
  page: "courses" | "progress" | "profile" | "courseDetails" | "assignments" | "liveClasses";
  profile: StudentProfile | null;
  error: string;
  notice: string;
  onDismiss: () => void;
  onLogout: () => void;
  onSelectCourse: (course: Course) => void;
  onSelectBatch: (batch: Batch) => void;
  onShowCourses: () => void;
  onShowCourseDetails: (course: Course) => void;
  onShowProgress: () => void;
  onShowAssignments: () => void;
  onShowLiveClasses: () => void;
  onShowProfile: () => void;
  onRefreshBatch: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  onProfileSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const pendingHomework = homework.filter((assignment) => !assignment.submissions?.length).length;
  const courseTitle = selectedCourse?.title ?? "তোমার কোর্স";
  const [courseChatOpen, setCourseChatOpen] = useState(false);
  const [courseSearch, setCourseSearch] = useState("");
  const selectedCourseProgress = progress.filter((batch) => batch.course.id === selectedCourse?.id);
  const courseVideoCount = selectedCourseProgress.reduce((total, batch) => total + batch.totalVideos, 0);
  const courseCompletedCount = selectedCourseProgress.reduce((total, batch) => total + batch.completedVideos, 0);
  const courseProgressPercentage = courseVideoCount
    ? Math.round((courseCompletedCount / courseVideoCount) * 100)
    : 0;
  const liveClassCount = folders.reduce(
    (total, folder) => total + folder.contents.filter((content) => content.type === "LIVE_LINK").length,
    0,
  );
  const filteredCourses = courses.filter((course) => {
    const query = courseSearch.trim().toLocaleLowerCase();
    if (!query) return true;
    const searchable = [
      course.title,
      course.description,
      course.teacher?.name,
      ...(course.batches ?? []).map((batch) => batch.name),
    ];
    return searchable.some((value) => value?.toLocaleLowerCase().includes(query));
  });

  function scrollToSection(id: string) {
    const fallbackId = "student-courses";
    const target = document.getElementById(id)
      ?? document.getElementById(fallbackId);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function navigateToLearningSection(id: string) {
    if (page !== "courses") onShowCourses();
    window.setTimeout(() => scrollToSection(id), 80);
  }

  function openCourseChat() {
    if (page !== "courses") onShowCourses();
    if (selectedCourse) setCourseChatOpen(true);
    else window.setTimeout(() => scrollToSection("student-courses"), 80);
  }

  function continueCourse() {
    onShowCourses();
    window.setTimeout(() => scrollToSection("student-course-space"), 80);
  }

  return (
    <div className="student-portal">
      <header className="student-site-header">
        <a className="landing-brand" href="/student/courses" onClick={(event) => { event.preventDefault(); onShowCourses(); }}>
          <span className="landing-brand-mark"><span /></span>
          <span>classroom<span className="landing-brand-dot">.</span></span>
        </a>
        <nav className="student-site-nav" aria-label="শিক্ষার্থী নেভিগেশন">
          <button className={page === "courses" ? "active" : ""} onClick={onShowCourses}>আমার ক্লাস</button>
          <button className={page === "liveClasses" ? "active" : ""} onClick={onShowLiveClasses}>লাইভ ক্লাস</button>
          <button className={page === "assignments" ? "active" : ""} onClick={onShowAssignments}>অ্যাসাইনমেন্ট</button>
          <button className={page === "progress" ? "active" : ""} onClick={onShowProgress}>অগ্রগতি</button>
          <button onClick={openCourseChat}>শিক্ষককে জিজ্ঞাসা</button>
        </nav>
        <div className="student-site-account">
          <span className="student-site-avatar">{user.name.charAt(0).toUpperCase()}</span>
          <span className="student-site-name">{user.name}</span>
          <button className="student-site-profile" onClick={onShowProfile}>প্রোফাইল</button>
          <button className="student-site-logout" onClick={onLogout} aria-label="লগ-আউট" title="লগ-আউট">↗</button>
        </div>
      </header>

      <main className="student-site-main">
        {page === "courseDetails" ? (
          selectedCourse ? (
            <CourseDetailsPage
              course={selectedCourse}
              batches={availableBatches}
              selectedBatch={selectedBatch}
              folders={folders}
              homework={homework}
              token={token}
              onBack={onShowCourses}
              onSelectBatch={onSelectBatch}
              onContinue={continueCourse}
            />
          ) : (
            <EmptyState icon="▤" title="কোর্স পাওয়া যায়নি" text="কোর্সটি আবার বেছে নিয়ে চেষ্টা করো।" />
          )
        ) : page === "assignments" ? (
          <>
            {(error || notice) && (
              <div className={`alert ${error ? "alert-error" : "alert-success"}`} role={error ? "alert" : "status"} aria-live="polite">
                {error || notice}<button onClick={onDismiss} aria-label="বার্তা বন্ধ করুন">×</button>
              </div>
            )}
            <StudentAssignmentsPage
              user={user}
              courses={courses}
              course={selectedCourse}
              batches={availableBatches}
              selectedBatch={selectedBatch}
              homework={homework}
              token={token}
              onSelectCourse={onSelectCourse}
              onSelectBatch={onSelectBatch}
              onRefresh={onRefreshBatch}
              onError={onError}
              onNotice={onNotice}
            />
          </>
        ) : page === "liveClasses" ? (
          <LiveClassesPage
            courses={courses}
            course={selectedCourse}
            batches={availableBatches}
            selectedBatch={selectedBatch}
            folders={folders}
            onSelectCourse={onSelectCourse}
            onSelectBatch={onSelectBatch}
          />
        ) : page === "courses" ? (
          <>
            {(error || notice) && (
              <div className={`alert ${error ? "alert-error" : "alert-success"}`} role={error ? "alert" : "status"} aria-live="polite">
                {error || notice}<button onClick={onDismiss} aria-label="বার্তা বন্ধ করুন">×</button>
              </div>
            )}

            <section className="student-courses-section" id="student-courses">
              <div className="student-dashboard-welcome">
                <div><h1>Welcome Back {user.name}, Ready For Your Next Lesson?</h1></div>
                <label className="student-course-search">
                  <span aria-hidden="true">⌕</span>
                  <input type="search" value={courseSearch} onChange={(event) => setCourseSearch(event.target.value)} placeholder="কোর্স খুঁজুন" aria-label="কোর্স খুঁজুন" />
                </label>
              </div>
              {filteredCourses.length > 0 && (
                <div className="student-course-tabs" role="tablist" aria-label="তোমার কোর্স">
                  {filteredCourses.map((course) => (
                    <button
                      key={course.id}
                      type="button"
                      role="tab"
                      aria-selected={selectedCourse?.id === course.id}
                      className={selectedCourse?.id === course.id ? "active" : ""}
                      onClick={() => onSelectCourse(course)}
                      aria-label={course.title}
                    >
                      <span>♧</span>Level {courses.findIndex((item) => item.id === course.id) + 1} Course
                    </button>
                  ))}
                  <button type="button" className="conceptual-tab" onClick={() => navigateToLearningSection("student-course-space")}>▣ Conceptual Session</button>
                </div>
              )}
              {filteredCourses.length ? (
                <>
                  {selectedCourse && (
                    <div className="student-featured-layout">
                      <CourseCard
                        course={selectedCourse}
                        index={Math.max(0, courses.findIndex((course) => course.id === selectedCourse.id))}
                        selected
                        heroVideo={folders.flatMap((folder) => folder.contents).find((item) => item.type === "VIDEO" && item.videoUrl) ?? null}
                        progressPercentage={courseProgressPercentage}
                        onClick={() => onShowCourseDetails(selectedCourse)}
                        onDetails={() => onShowCourseDetails(selectedCourse)}
                      />
                      <aside className="student-catchup-card">
                        <div className="catchup-heading"><span>🎯</span><strong>Catch-up Challenge</strong></div>
                        <h3>{pendingHomework ? "You are falling behind! Complete your assignments to catch up." : "Keep up the great work and stay on track!"}</h3>
                        <p>{pendingHomework ? `${formatNumber(pendingHomework)} assignment${pendingHomework === 1 ? "" : "s"} waiting for submission. Complete them to keep your learning on track.` : "Keep watching lessons and joining classes to reach your learning goal."}</p>
                        <button type="button" onClick={onShowAssignments}>অ্যাসাইনমেন্ট দেখো <span>→</span></button>
                      </aside>
                    </div>
                  )}
                  {selectedCourse && (
                    <nav className="student-learning-actions" aria-label="কোর্সের দ্রুত লিংক">
                      <button type="button" className="learning-action-live" onClick={onShowLiveClasses}>
                        <span className="learning-action-icon">↗</span>
                        <span><strong>লাইভ ক্লাস</strong><small>{formatNumber(liveClassCount)}টি ক্লাসে যাও</small></span>
                        <b>→</b>
                      </button>
                      <button type="button" className="learning-action-homework" onClick={onShowAssignments}>
                        <span className="learning-action-icon">✎</span>
                        <span><strong>অ্যাসাইনমেন্ট</strong><small>{formatNumber(pendingHomework)}টি কাজ বাকি</small></span>
                        <b>→</b>
                      </button>
                    </nav>
                  )}
                  {filteredCourses.some((course) => course.id !== selectedCourse?.id) && (
                    <div className="student-recommended-section">
                      <h2>Recommended for {selectedCourse?.title}</h2>
                      <div className="student-recommended-grid">
                        {filteredCourses.filter((course) => course.id !== selectedCourse?.id).map((course) => (
                          <CourseCard
                            key={course.id}
                            course={course}
                            index={courses.findIndex((item) => item.id === course.id)}
                            selected={false}
                            onClick={() => onShowCourseDetails(course)}
                            onDetails={() => onShowCourseDetails(course)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : courses.length ? (
                <EmptyState icon="⌕" title="কোর্স পাওয়া যায়নি" text="অন্য কোনো কোর্সের নাম দিয়ে খুঁজে দেখো।" />
              ) : (
                <EmptyState icon="✳" title="তোমার কোর্স এখানেই দেখা যাবে" text="শিক্ষক বা অ্যাডমিন তোমাকে কোনো ক্লাসে যুক্ত করলে লেসনগুলো এখানে পাবে।" />
              )}
            </section>

            {selectedCourse && (
              <section className="student-course-space" id="student-course-space">
                <div className="student-course-title">
                  <div><h2>{courseTitle}</h2><p>{selectedCourse.teacher ? `শিক্ষক ${selectedCourse.teacher.name}` : "ক্লাস, লেসন ও শিক্ষকের সঙ্গে যোগাযোগ"}</p></div>
                  {homework.length > 0 && <button className="student-homework-chip" type="button" onClick={onShowAssignments}>✎ {formatNumber(pendingHomework)}টি অ্যাসাইনমেন্ট বাকি</button>}
                </div>
                {availableBatches.length ? (
                  <>
                    <div className="batch-tabs">
                      {availableBatches.map((batch) => (
                        <button className={`batch-tab ${selectedBatch?.id === batch.id ? "active" : ""}`} key={batch.id} onClick={() => onSelectBatch(batch)}>
                          <span className="batch-tab-icon">▤</span>{batch.name}
                        </button>
                      ))}
                    </div>
                    {selectedBatch && (
                      <BatchView
                        user={user}
                        token={token}
                        batch={selectedBatch}
                        folders={folders}
                        homework={homework}
                        onRefresh={onRefreshBatch}
                        onError={onError}
                        onNotice={onNotice}
                      />
                    )}
                  </>
                ) : <EmptyState icon="▤" title="এই কোর্সে এখনো ক্লাস নেই" text="ক্লাস যোগ হলে এখানে দেখতে পাবে।" />}
                <CourseChat courseId={selectedCourse.id} courseTitle={selectedCourse.title} user={user} token={token} open={courseChatOpen} onOpenChange={setCourseChatOpen} />
              </section>
            )}
          </>
        ) : (
          <>
            {(error || notice) && (
              <div className={`alert ${error ? "alert-error" : "alert-success"}`} role={error ? "alert" : "status"} aria-live="polite">
                {error || notice}<button onClick={onDismiss} aria-label="বার্তা বন্ধ করুন">×</button>
              </div>
            )}
            {page === "progress" ? (
              <section className="student-secondary-page">
                <div className="student-section-heading"><div><span>তোমার শেখার যাত্রা</span><h2>অগ্রগতি দেখে নাও</h2><p>প্রতিদিনের ছোট্ট অগ্রগতিই তোমাকে পৌঁছে দেবে বড় লক্ষ্যে।</p></div></div>
                <ProgressView progress={progress} />
              </section>
            ) : profile ? (
              <section className="student-secondary-page">
                <div className="student-section-heading"><div><span>তোমার অ্যাকাউন্ট</span><h2>আমার প্রোফাইল</h2><p>তোমার ও অভিভাবকের তথ্য হালনাগাদ রাখো।</p></div></div>
                <div className="student-profile-surface"><StudentProfileForm profile={profile} onSubmit={onProfileSubmit} /></div>
              </section>
            ) : null}
          </>
        )}
      </main>
      <footer className="student-site-footer"><span>© ২০২৬ Classroom · শেখার আনন্দ সবার জন্য</span><span>প্রতিদিন একটু একটু করে এগিয়ে চলো <b>✦</b></span></footer>
    </div>
  );
}

function StudentAssignmentsPage({
  user,
  courses,
  course,
  batches,
  selectedBatch,
  homework,
  token,
  onSelectCourse,
  onSelectBatch,
  onRefresh,
  onError,
  onNotice,
}: {
  user: User;
  courses: Course[];
  course: Course | null;
  batches: Batch[];
  selectedBatch: Batch | null;
  homework: Homework[];
  token: string;
  onSelectCourse: (course: Course) => void;
  onSelectBatch: (batch: Batch) => void;
  onRefresh: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [openHomework, setOpenHomework] = useState("");
  const submittedCount = homework.filter((assignment) => assignment.submissions?.length).length;
  const pendingCount = homework.length - submittedCount;

  return (
    <section className="student-assignment-page">
      <header className="student-assignment-heading">
        <div>
          <span>তোমার পড়াশোনা</span>
          <h1>অ্যাসাইনমেন্ট</h1>
          <p>কাজ জমা দাও, জমা দেওয়া কাজ আপডেট করো এবং শিক্ষকের দেওয়া নম্বর দেখো।</p>
        </div>
        <div className="student-assignment-selectors">
          {courses.length > 1 && (
            <label>
              <span>কোর্স বেছে নাও</span>
              <select value={course?.id ?? ""} onChange={(event) => {
                const nextCourse = courses.find((item) => item.id === event.target.value);
                if (nextCourse) onSelectCourse(nextCourse);
              }}>
                {courses.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
              </select>
            </label>
          )}
          {batches.length > 1 && (
            <label>
              <span>ক্লাস বেছে নাও</span>
              <select value={selectedBatch?.id ?? ""} onChange={(event) => {
                const batch = batches.find((item) => item.id === event.target.value);
                if (batch) onSelectBatch(batch);
              }}>
                {batches.map((batch) => <option value={batch.id} key={batch.id}>{batch.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </header>

      <div className="student-assignment-summary">
        <div><span>কোর্স</span><strong>{course?.title ?? "কোনো কোর্স নির্বাচিত নেই"}</strong></div>
        <div><span>ক্লাস</span><strong>{selectedBatch?.name ?? "কোনো ক্লাস নেই"}</strong></div>
        <div><span>মোট কাজ</span><strong>{formatNumber(homework.length)}</strong></div>
        <div><span>বাকি</span><strong>{formatNumber(pendingCount)}</strong></div>
        <div><span>জমা হয়েছে</span><strong>{formatNumber(submittedCount)}</strong></div>
      </div>

      <div className="student-assignment-list">
        {homework.length ? homework.map((assignment) => (
          <HomeworkRow
            key={assignment.id}
            homework={assignment}
            user={user}
            token={token}
            open={openHomework === assignment.id}
            onToggle={() => setOpenHomework(openHomework === assignment.id ? "" : assignment.id)}
            onError={onError}
            onNotice={onNotice}
            onRefresh={onRefresh}
          />
        )) : (
          <EmptyState
            icon="✎"
            title={selectedBatch ? "এখনো কোনো অ্যাসাইনমেন্ট নেই" : "কোনো ক্লাস পাওয়া যায়নি"}
            text={selectedBatch ? "শিক্ষক অ্যাসাইনমেন্ট দিলে এখানে দেখতে ও জমা দিতে পারবে।" : "কোর্সে ক্লাস যুক্ত হলে অ্যাসাইনমেন্ট এখানে দেখা যাবে।"}
          />
        )}
      </div>
    </section>
  );
}

function LiveClassesPage({
  courses,
  course,
  batches,
  selectedBatch,
  folders,
  onSelectCourse,
  onSelectBatch,
}: {
  courses: Course[];
  course: Course | null;
  batches: Batch[];
  selectedBatch: Batch | null;
  folders: Folder[];
  onSelectCourse: (course: Course) => void;
  onSelectBatch: (batch: Batch) => void;
}) {
  const liveClasses = folders.flatMap((folder) =>
    folder.contents
      .filter((content) => content.type === "LIVE_LINK" && content.liveUrl)
      .map((content) => ({ ...content, folderTitle: folder.title })),
  );

  return (
    <section className="student-live-page">
      <header className="student-live-heading">
        <div>
          <span>শিক্ষকের দেওয়া ক্লাস লিংক</span>
          <h1>লাইভ ক্লাস</h1>
          <p>শিক্ষক ক্লাসের লিংক যোগ করলে সেটি এখানে দেখা যাবে। ক্লাসে যোগ দিতে লিংকে ক্লিক করো।</p>
        </div>
        <div className="student-assignment-selectors">
          {courses.length > 1 && (
            <label>
              <span>কোর্স বেছে নাও</span>
              <select value={course?.id ?? ""} onChange={(event) => {
                const nextCourse = courses.find((item) => item.id === event.target.value);
                if (nextCourse) onSelectCourse(nextCourse);
              }}>
                {courses.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
              </select>
            </label>
          )}
          {batches.length > 1 && (
            <label>
              <span>ক্লাস বেছে নাও</span>
              <select value={selectedBatch?.id ?? ""} onChange={(event) => {
                const batch = batches.find((item) => item.id === event.target.value);
                if (batch) onSelectBatch(batch);
              }}>
                {batches.map((batch) => <option value={batch.id} key={batch.id}>{batch.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </header>

      <div className="student-live-context">
        <span><small>কোর্স</small><strong>{course?.title ?? "কোনো কোর্স নির্বাচিত নেই"}</strong></span>
        <span><small>ক্লাস</small><strong>{selectedBatch?.name ?? "কোনো ক্লাস নেই"}</strong></span>
        <span><small>লাইভ লিংক</small><strong>{formatNumber(liveClasses.length)}টি</strong></span>
      </div>

      {liveClasses.length ? (
        <div className="student-live-list">
          {liveClasses.map((liveClass) => (
            <article className="student-live-card" key={liveClass.id}>
              <span className="student-live-icon">↗</span>
              <div>
                <h2>{liveClass.title}</h2>
                <p>{liveClass.folderTitle} · {selectedBatch?.name ?? course?.title}</p>
              </div>
              <a href={liveClass.liveUrl ?? undefined} target="_blank" rel="noreferrer">ক্লাসে যোগ দাও <span>↗</span></a>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="↗"
          title={selectedBatch ? "এখনো কোনো লাইভ ক্লাসের লিংক নেই" : "কোনো ক্লাস পাওয়া যায়নি"}
          text={selectedBatch ? "শিক্ষক কোর্সের লেসন যোগ করার সময় লাইভ ক্লাসের লিংক দিলে সেটি এখানে দেখা যাবে।" : "কোর্সে ক্লাস যুক্ত হলে লাইভ ক্লাসের লিংক এখানে দেখা যাবে।"}
        />
      )}
    </section>
  );
}

function LandingPage({ onLogin, onRegister }: { onLogin: () => void; onRegister: () => void }) {
  const learningTools = [
    { title: "ভিডিও লেসন", detail: "ভিডিও দেখে শেখো", icon: "▶", color: "coral" },
    { title: "লাইভ ক্লাস", detail: "লাইভ ক্লাসে যুক্ত হও", icon: "↗", color: "amber" },
    { title: "লিখিত লেসন", detail: "পড়ে শেখার উপকরণ", icon: "T", color: "green" },
    { title: "ডকুমেন্ট", detail: "ক্লাসের প্রয়োজনীয় ফাইল", icon: "▤", color: "blue" },
    { title: "অ্যাসাইনমেন্ট", detail: "অনুশীলন জমা দাও", icon: "✎", color: "violet" },
    { title: "শেখার অগ্রগতি", detail: "নিজের অগ্রগতি দেখো", icon: "◷", color: "pink" },
  ];

  return (
    <main className="landing-page">
      <header className="landing-header">
        <a className="landing-brand" href="#" onClick={(event) => event.preventDefault()} aria-label="Classroom home">
          <span className="landing-brand-mark"><span /></span>
          <span>classroom<span className="landing-brand-dot">.</span></span>
        </a>
        <nav className="landing-nav" aria-label="প্রধান নেভিগেশন">
          <a href="#programs">ক্লাস ৫–১২ <span>⌄</span></a>
          <a href="#programs">অনলাইন কোর্স <span>⌄</span></a>
          <a href="#why-classroom">আমাদের সম্পর্কে</a>
        </nav>
        <div className="landing-actions">
          <button className="landing-search" type="button" aria-label="কোর্স খুঁজুন" onClick={() => document.getElementById("programs")?.scrollIntoView({ behavior: "smooth" })}>⌕</button>
          <button className="landing-login" onClick={onLogin}>লগ-ইন</button>
          <button className="landing-join" onClick={onRegister}>শুরু করুন <span>→</span></button>
        </div>
      </header>

      <section className="landing-hero">
        <div className="hero-glow" />
        <div className="hero-orbit hero-orbit-one" />
        <div className="hero-orbit hero-orbit-two" />
        <span className="hero-star hero-star-one">✦</span>
        <span className="hero-star hero-star-two">✧</span>
        <div className="hero-copy">
          <span className="hero-kicker"><i /> তোমার শেখার নতুন ঠিকানা</span>
          <h1>শেখা হোক <span>আনন্দের!</span></h1>
          <p>স্কুল, কলেজ আর জীবনের প্রতিটি ধাপে—নিজের গতিতে শিখে এগিয়ে যাও স্বপ্নের আরও কাছে।</p>
          <div className="hero-buttons">
            <button className="hero-primary" onClick={onRegister}>শেখা শুরু করো <span>→</span></button>
            <a className="hero-secondary" href="#programs"><span className="play-icon">▶</span> শেখার সুবিধাগুলো দেখো</a>
          </div>
        </div>
        <div className="hero-learning-art" aria-hidden="true">
          <div className="art-sun" />
          <div className="art-book"><span /><i /><b /></div>
          <div className="art-pencil">✎</div>
          <div className="art-note art-note-top"><span>✦</span> নতুন কিছু শিখি</div>
          <div className="art-note art-note-bottom"><strong>নিজের গতিতে</strong><span>শেখার স্বাধীনতা</span></div>
        </div>
        <div className="hero-programs" id="programs">
          {learningTools.map((tool) => (
            <article className={`program-card program-${tool.color}`} key={tool.title}>
              <span className="program-art"><span>{tool.icon}</span><i /></span>
              <strong>{tool.title}</strong>
              <small>{tool.detail}</small>
            </article>
          ))}
        </div>
        <a className="hero-free-link" href="#why-classroom">তোমার শেখার যাত্রা শুরু হোক <span>↓</span></a>
      </section>

      <section className="landing-proof" id="why-classroom">
        <div className="proof-intro">
          <span className="landing-eyebrow">কেন classroom?</span>
          <h2>শেখার প্রতিটি ধাপে<br />পাশে আছি আমরা।</h2>
          <p>পড়াশোনা হোক সহজ, গুছানো আর আনন্দের—তোমার শেখার জন্য প্রয়োজনীয় সবকিছু এক জায়গায়।</p>
          <button className="proof-link" onClick={onRegister}>আজই শুরু করো <span>→</span></button>
        </div>
        <div className="proof-grid">
          <article className="proof-card proof-card-mint"><span>✦</span><h3>নিজের গতিতে শেখো</h3><p>যেকোনো সময়, যেকোনো জায়গা থেকে পড়াশোনা চালিয়ে যাও।</p></article>
          <article className="proof-card proof-card-lilac"><span>▤</span><h3>সবকিছু এক জায়গায়</h3><p>ক্লাস, লেসন, নোট আর অ্যাসাইনমেন্ট থাকুক হাতের নাগালে।</p></article>
          <article className="proof-card proof-card-peach"><span>↗</span><h3>এগিয়ে যাও প্রতিদিন</h3><p>ছোট ছোট অগ্রগতিই তোমাকে পৌঁছে দেবে বড় লক্ষ্যে।</p></article>
        </div>
      </section>

      <section className="landing-cta">
        <div><span className="landing-eyebrow">আজ থেকেই শুরু</span><h2>তোমার পরের বড় আইডিয়াটা<br />শুরু হোক এখানেই।</h2></div>
        <button className="hero-primary" onClick={onRegister}>ফ্রি অ্যাকাউন্ট খোলো <span>→</span></button>
        <span className="cta-spark">✦</span>
      </section>
      <footer className="landing-footer">
        <a className="landing-brand" href="#" onClick={(event) => event.preventDefault()}>
          <span className="landing-brand-mark"><span /></span><span>classroom<span className="landing-brand-dot">.</span></span>
        </a>
        <span>© ২০২৬ Classroom · শেখার আনন্দ সবার জন্য</span>
        <button onClick={onLogin}>শিক্ষার্থী ও শিক্ষক লগ-ইন <span>→</span></button>
      </footer>
    </main>
  );
}

function CourseDetailsPage({
  course,
  batches,
  selectedBatch,
  folders,
  homework,
  token,
  onBack,
  onSelectBatch,
  onContinue,
}: {
  course: Course;
  batches: Batch[];
  selectedBatch: Batch | null;
  folders: Folder[];
  homework: Homework[];
  token: string;
  onBack: () => void;
  onSelectBatch: (batch: Batch) => void;
  onContinue: () => void;
}) {
  const contents = folders.flatMap((folder) => folder.contents);
  const previewVideo = contents.find((item) => item.type === "VIDEO" && item.videoUrl);
  const counts = {
    videos: contents.filter((item) => item.type === "VIDEO").length,
    liveClasses: contents.filter((item) => item.type === "LIVE_LINK").length,
    documents: contents.filter((item) => item.type === "DOCUMENT").length,
    lessons: contents.filter((item) => item.type === "TEXT").length,
  };

  return (
    <div className="student-detail-page">
      <button className="student-detail-back" type="button" onClick={onBack}>← আমার কোর্সে ফিরে যাও</button>
      <section className="student-detail-hero">
        <div className="student-detail-hero-copy">
          <span className="student-detail-eyebrow">COURSE OVERVIEW</span>
          <h1>{course.title}</h1>
          <p>{course.description || "শিক্ষকের তৈরি ক্লাস, ভিডিও লেসন ও শেখার উপকরণ এক জায়গায় সাজানো হয়েছে।"}</p>
          <div className="student-detail-instructor">
            <span>{course.teacher?.name?.charAt(0).toUpperCase() ?? "T"}</span>
            <div><small>কোর্স শিক্ষক</small><strong>{course.teacher?.name ?? "তথ্য পাওয়া যায়নি"}</strong></div>
          </div>
          <div className="student-detail-facts">
            <span>♧ {formatNumber(batches.length)}টি ক্লাস</span>
            <span>♙ {formatNumber(course.studentCount ?? 0)} জন শিক্ষার্থী</span>
            <span>▶ {formatNumber(counts.videos)}টি ভিডিও</span>
          </div>
          <button className="student-detail-primary" type="button" onClick={onContinue}>কোর্স শুরু করো <span>→</span></button>
        </div>
        <div className="student-detail-preview">
          {previewVideo?.videoUrl ? (
            <VideoPlayer videoUrl={previewVideo.videoUrl} title={previewVideo.title} />
          ) : (
            <div className="student-detail-preview-empty">
              <span>▶</span>
              <strong>কোর্স প্রিভিউ</strong>
              <small>শিক্ষক ভিডিও যোগ করলে এখানে দেখা যাবে</small>
            </div>
          )}
        </div>
      </section>

      <div className="student-detail-layout">
        <main className="student-detail-main">
          <section className="student-detail-panel">
            <div className="student-detail-section-heading"><span>WHAT YOU'LL LEARN</span><h2>এই কোর্সে যা যা শিখবে</h2></div>
            <div className="student-detail-outcomes">
              {[
                [counts.videos, "ভিডিও লেসন", "নিজের সুবিধামতো ভিডিও দেখে শেখো"],
                [counts.liveClasses, "লাইভ ক্লাস", "শিক্ষকের সঙ্গে সরাসরি ক্লাসে যুক্ত হও"],
                [counts.documents, "কোর্স ডকুমেন্ট", "ক্লাসের নোট ও প্রয়োজনীয় ফাইল দেখো"],
                [counts.lessons, "লিখিত লেসন", "গুছানো টেক্সট লেসন পড়ে অনুশীলন করো"],
              ].map(([count, title, description]) => (
                <div className="student-detail-outcome" key={String(title)}>
                  <span>✓</span><div><strong>{title}</strong><small>{description} · {formatNumber(Number(count))}টি</small></div>
                </div>
              ))}
            </div>
          </section>

          <section className="student-detail-panel student-curriculum">
            <div className="student-detail-section-heading">
              <span>COURSE CURRICULUM</span><h2>কোর্স কারিকুলাম</h2>
              <p>শিক্ষক যে ক্লাস ও লেসনগুলো যোগ করেছেন</p>
            </div>
            {batches.length > 1 && (
              <label className="student-detail-batch-select">ক্লাস বেছে নাও
                <select value={selectedBatch?.id ?? ""} onChange={(event) => {
                  const batch = batches.find((item) => item.id === event.target.value);
                  if (batch) onSelectBatch(batch);
                }}>
                  {batches.map((batch) => <option value={batch.id} key={batch.id}>{batch.name}</option>)}
                </select>
              </label>
            )}
            {folders.length ? (
              <div className="student-detail-modules">
                {folders.map((folder, index) => (
                  <details key={folder.id} className="student-detail-module" open={index === 0}>
                    <summary>
                      <span className="student-detail-module-number">{String(index + 1).padStart(2, "0")}</span>
                      <span><strong>{folder.title}</strong><small>{formatNumber(folder.contents.filter((item) => item.type !== "LIVE_LINK").length)}টি লেসন · {formatNumber(folder.homework.length)}টি অ্যাসাইনমেন্ট</small></span>
                      <b>⌄</b>
                    </summary>
                    <div className="student-detail-module-items">
                      {folder.contents.filter((item) => item.type !== "LIVE_LINK").map((item) => (
                        <div key={item.id}>
                          <span>{item.type === "VIDEO" ? "▶" : item.type === "LIVE_LINK" ? "↗" : item.type === "DOCUMENT" ? "▤" : "T"}</span>
                          <strong>{item.title}</strong><small>{item.type.replace("_", " ")}</small>
                        </div>
                      ))}
                      {folder.homework.map((item) => (
                        <div key={item.id}>
                          <span>✎</span><strong>{item.title}</strong><small>অ্যাসাইনমেন্ট</small>
                        </div>
                      ))}
                      {!folder.contents.length && !folder.homework.length && <p>এই মডিউলে এখনো কোনো লেসন যোগ হয়নি।</p>}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <EmptyState icon="▤" title="কারিকুলাম যোগ করা হচ্ছে" text={selectedBatch ? "শিক্ষক এই ক্লাসে লেসন যোগ করলে এখানে দেখতে পাবে।" : "কারিকুলাম দেখতে একটি ক্লাস বেছে নাও।"} />
            )}
          </section>

          <CourseReviews courseId={course.id} token={token} />
        </main>
        <aside className="student-detail-sidebar">
          <section className="student-detail-panel">
            <div className="student-detail-section-heading"><span>YOUR COURSE</span><h2>কোর্সে যা থাকছে</h2></div>
            <ul>
              <li>▶ <span>{formatNumber(counts.videos)}টি ভিডিও লেসন</span></li>
              <li>↗ <span>{formatNumber(counts.liveClasses)}টি লাইভ ক্লাস</span></li>
              <li>▤ <span>{formatNumber(counts.documents)}টি ডকুমেন্ট</span></li>
              <li>✎ <span>{formatNumber(homework.length)}টি অ্যাসাইনমেন্ট</span></li>
              <li>♙ <span>{formatNumber(course.studentCount ?? 0)} জন শিক্ষার্থী</span></li>
            </ul>
            <button type="button" onClick={onContinue}>শেখা শুরু করো <span>→</span></button>
          </section>
          <section className="student-detail-panel student-detail-teacher">
            <span className="student-detail-eyebrow">YOUR INSTRUCTOR</span>
            <div className="student-detail-instructor">
              <span>{course.teacher?.name?.charAt(0).toUpperCase() ?? "T"}</span>
              <div><small>কোর্স শিক্ষক</small><strong>{course.teacher?.name ?? "তথ্য পাওয়া যায়নি"}</strong></div>
            </div>
            <p>কোর্সের লেসন ও ক্লাস পরিচালনা করছেন তোমার শিক্ষক। কোনো প্রশ্ন থাকলে course chat-এ যোগাযোগ করো।</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function AuthScreen({
  view,
  loading,
  error,
  notice,
  resetEmail,
  onSubmit,
  onBackToHome,
  onChangeView,
}: {
  view: AuthView;
  loading: boolean;
  error: string;
  notice: string;
  resetEmail: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBackToHome: () => void;
  onChangeView: (view: AuthView) => void;
}) {
  const isRecovery = view === "forgot" || view === "reset";
  const isReset = view === "reset";
  const isRegister = view === "register";
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const heading = isRegister
    ? "Create your account"
    : isReset
      ? "Choose a new password"
      : view === "forgot"
        ? "Reset your password"
        : "Sign in to your space";
  const subtitle = isRegister
    ? "Join your classroom and get started today."
    : isReset
      ? "Enter the 6-digit code from your email and your new password."
      : view === "forgot"
        ? "We’ll email a reset code if an account exists for that address."
        : "Your classroom is right where you left it.";

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <a className="brand brand-light" href="#" onClick={(event) => event.preventDefault()}>
          <span className="brand-mark">C</span><span>classroom<span className="brand-dot">.</span></span>
        </a>
        <div className="visual-copy">
          <span className="visual-kicker"><i /> YOUR SPACE TO GROW</span>
          <h1>Big ideas<br />start <em>here.</em></h1>
          <p>A thoughtful space to learn, teach, and make progress that matters.</p>
          <div className="visual-bottom">
            <div className="avatar-stack"><span>A</span><span>M</span><span>S</span><b>+</b></div>
            <span>Growing together,<br /><strong>one lesson at a time.</strong></span>
          </div>
        </div>
        <span className="visual-decoration decoration-one" />
        <span className="visual-decoration decoration-two" />
      </section>
      <section className="auth-panel">
        <div className="auth-panel-top">
          <button className="auth-home-link" onClick={onBackToHome}>← হোমপেজ</button>
          <span>{isRecovery ? "Remembered your password?" : isRegister ? "Already have an account?" : "New to Classroom?"}</span>
          <button onClick={() => onChangeView(view === "login" ? "register" : "login")}>
            {view === "login" ? "Create account" : "Sign in"}
          </button>
        </div>
        <div className="auth-form-wrap">
          <span className="auth-icon">{view === "login" ? "↗" : isRecovery ? "↻" : "✳"}</span>
          <p className="eyebrow">{view === "login" ? "WELCOME BACK" : isRecovery ? "ACCOUNT RECOVERY" : "START LEARNING"}</p>
          <h2>{heading}</h2>
          <p className="auth-subtitle">{subtitle}</p>
          {(error || notice) && <div className={`alert ${error ? "alert-error" : "alert-success"}`} role={error ? "alert" : "status"} aria-live="polite">{error || notice}</div>}
          <form className="auth-form" onSubmit={onSubmit}>
            {isRegister && (
              <label>
                Full name
                <input name="name" autoComplete="name" placeholder="e.g. Alex Morgan" required maxLength={120} />
              </label>
            )}
            {view !== "reset" && (
              <label>
                Email address
                <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} />
              </label>
            )}
            {isReset && (
              <>
                <label>
                  Email address
                  <input name="email" type="email" autoComplete="email" defaultValue={resetEmail} required />
                </label>
                <label>
                  Reset code
                  <input name="otp" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" pattern="[0-9]{6}" maxLength={6} required />
                </label>
              </>
            )}
            {(view === "login" || isRegister || isReset) && (
              <label>
                {isReset ? "New password" : "Password"}
                <span className="password-input-wrap">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={view === "login" ? "current-password" : "new-password"}
                    placeholder={view === "login" ? "Enter your password" : "At least 16 characters"}
                    minLength={view === "login" ? 1 : 16}
                    maxLength={128}
                    pattern={view === "login" ? undefined : "(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{16,128}"}
                    required
                  />
                  <button
                    className="password-visibility"
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </span>
              </label>
            )}
            {(isRegister || isReset) && (
              <label>
                Confirm password
                <span className="password-input-wrap">
                  <input
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                    minLength={16}
                    maxLength={128}
                    required
                  />
                  <button
                    className="password-visibility"
                    type="button"
                    onClick={() => setShowConfirmPassword((visible) => !visible)}
                    aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
                    aria-pressed={showConfirmPassword}
                  >
                    {showConfirmPassword ? "Hide" : "Show"}
                  </button>
                </span>
              </label>
            )}
            {(isRegister || isReset) && (
              <small className="field-hint">Use at least 16 characters with uppercase, lowercase, a number, and a symbol.</small>
            )}
            {view === "login" && (
              <button className="auth-link" type="button" onClick={() => onChangeView("forgot")}>
                Forgot password?
              </button>
            )}
            <button className="button button-primary auth-submit" type="submit" disabled={loading}>
              {loading
                ? "Please wait..."
                : view === "login"
                  ? "Sign in"
                  : isRegister
                    ? "Create student account"
                    : view === "forgot"
                      ? "Send reset code"
                      : "Reset password"} <span>→</span>
            </button>
          </form>
          {!isRecovery && <p className="auth-terms">By continuing, you agree to use this learning space responsibly.</p>}
        </div>
        <div className="auth-footer">© 2026 Classroom <span>Made for learning <b>✦</b></span></div>
      </section>
    </main>
  );
}

function CourseCard({
  course,
  index,
  selected,
  heroVideo = null,
  progressPercentage,
  onClick,
  onDetails,
  onDelete,
  deleting = false,
}: {
  course: Course;
  index: number;
  selected: boolean;
  heroVideo?: Content | null;
  progressPercentage?: number;
  onClick: () => void;
  onDetails?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const colors = ["mint", "lavender", "peach", "blue"];
  const symbols = ["📚", "🎯", "🚀", "💡"];
  const batches = course.batches ?? (course.batch ? [course.batch] : []);
  return (
    <article className={`course-card ${selected ? "selected" : ""} ${heroVideo ? "course-card-video-hero" : ""}`}>
      {heroVideo ? (
        <div className="course-card-hero-video">
          {heroVideo.videoUrl && <VideoPlayer videoUrl={heroVideo.videoUrl} title={heroVideo.title} />}
        </div>
      ) : null}
      <button className="course-card-main" type="button" onClick={onClick} aria-pressed={selected}>
        {!heroVideo && (
          <div className={`course-art ${colors[index % colors.length]}`}>
            <span className="course-art-symbol">{symbols[index % symbols.length]}</span>
            <span className="course-art-orbit" />
          </div>
        )}
        <div className="course-info">
          <div className="course-meta"><span className="course-tag">{formatNumber(batches.length)}টি ক্লাস</span><span className="course-arrow">↗</span></div>
          <h3>{course.title}</h3>
          <p>{typeof progressPercentage === "number"
            ? course.teacher?.name ?? "Course Instructor"
            : course.description || "তোমার শেখার পরের অধ্যায় শুরু হোক এখান থেকেই."}</p>
          <div className="course-social-proof">
            <span>শিক্ষক <strong>{course.teacher?.name ?? "তথ্য পাওয়া যায়নি"}</strong></span>
            <span><strong>{formatNumber(course.studentCount ?? 0)}</strong> জন শিক্ষার্থী</span>
          </div>
          {typeof progressPercentage === "number" && (
            <div className="course-card-progress">
              <div><span>কোর্সের অগ্রগতি</span><strong>{formatNumber(progressPercentage)}%</strong></div>
              <i><b style={{ width: `${progressPercentage}%` }} /></i>
            </div>
          )}
          <div className="course-bottom"><span>{batches.length ? batches.map((batch) => batch.name).join(" · ") : "শুরু করার জন্য প্রস্তুত"}</span></div>
        </div>
      </button>
      {onDetails && (
        <button className="course-details-link" type="button" onClick={onDetails}>
          কোর্সের বিস্তারিত <span>→</span>
        </button>
      )}
      {onDelete && (
        <button
          className="course-delete"
          type="button"
          disabled={deleting}
          onClick={onDelete}
          aria-label={`“${course.title}” কোর্স মুছুন`}
          title="কোর্স মুছুন"
        >
          {deleting ? "মুছছে…" : "মুছুন"}
        </button>
      )}
    </article>
  );
}

function CourseReviews({ courseId, token }: { courseId: string; token: string }) {
  const [reviews, setReviews] = useState<CourseReview[]>([]);
  const [myReview, setMyReview] = useState<CourseReview | null>(null);
  const [averageRating, setAverageRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<{
      reviews: CourseReview[];
      summary: { averageRating: number; reviewCount: number };
      myReview: CourseReview | null;
    }>(`/courses/${courseId}/reviews`, { token })
      .then((result) => {
        if (!active) return;
        setReviews(result.reviews);
        setAverageRating(result.summary.averageRating);
        setReviewCount(result.summary.reviewCount);
        setMyReview(result.myReview);
        setRating(result.myReview?.rating ?? 5);
        setContent(result.myReview?.content ?? "");
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "রিভিউ লোড করা যায়নি।");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId, token]);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api(`/courses/${courseId}/reviews`, { method: "POST", token, body: { rating, content } });
      const result = await api<{
        reviews: CourseReview[];
        summary: { averageRating: number; reviewCount: number };
        myReview: CourseReview | null;
      }>(`/courses/${courseId}/reviews`, { token });
      setReviews(result.reviews);
      setAverageRating(result.summary.averageRating);
      setReviewCount(result.summary.reviewCount);
      setMyReview(result.myReview);
      setNotice("তোমার রিভিউ সংরক্ষণ হয়েছে।");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "রিভিউ জমা দেওয়া যায়নি।");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="student-reviews-section" aria-labelledby="student-reviews-title">
      <div className="student-reviews-heading">
        <div><span>STUDENT VOICES</span><h2 id="student-reviews-title">শিক্ষার্থীদের রিভিউ</h2></div>
        <div className="student-review-summary"><strong>★ {averageRating.toFixed(1)}</strong><span>{formatNumber(reviewCount)}টি রিভিউ</span></div>
      </div>
      {error && <p className="student-review-message error" role="alert">{error}</p>}
      {notice && <p className="student-review-message" role="status">{notice}</p>}
      {loading ? <p className="student-outline-empty">রিভিউ লোড হচ্ছে…</p> : reviews.length ? (
        <div className="student-review-list">
          {reviews.map((review) => (
            <article className="student-review-card" key={review.id}>
              <div><strong>{review.student.name}</strong><span>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span></div>
              <p>{review.content}</p>
              <small>{new Date(review.createdAt).toLocaleDateString("bn-BD")}</small>
            </article>
          ))}
        </div>
      ) : <p className="student-outline-empty">এখনো কোনো শিক্ষার্থী রিভিউ দেয়নি। তোমার অভিজ্ঞতা দিয়ে প্রথম রিভিউটি দাও।</p>}
      <form className="student-review-form" onSubmit={(event) => void submitReview(event)}>
        <label>তোমার রেটিং
          <select value={rating} onChange={(event) => setRating(Number(event.target.value))}>
            {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} / 5 {"★".repeat(value)}</option>)}
          </select>
        </label>
        <label>তোমার অভিজ্ঞতা
          <textarea value={content} onChange={(event) => setContent(event.target.value)} minLength={3} maxLength={1200} required placeholder="কোর্সটি সম্পর্কে তোমার মতামত লেখো…" />
        </label>
        <button type="submit" disabled={saving}>{saving ? "সংরক্ষণ হচ্ছে…" : myReview ? "রিভিউ আপডেট করো" : "রিভিউ জমা দাও"}</button>
      </form>
    </section>
  );
}

function CourseChat({
  courseId,
  courseTitle,
  user,
  token,
  open,
  onOpenChange,
}: {
  courseId: string;
  courseTitle: string;
  user: User;
  token: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [messages, setMessages] = useState<CourseMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [chatError, setChatError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);
  const cursorRef = useRef("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const isOpen = open ?? localOpen;

  function setOpen(nextOpen: boolean) {
    if (onOpenChange) onOpenChange(nextOpen);
    else setLocalOpen(nextOpen);
  }

  useEffect(() => {
    let active = true;
    let fetching = false;
    cursorRef.current = "";
    setMessages([]);
    setLoaded(false);

    async function refreshMessages() {
      if (fetching || document.visibilityState === "hidden") return;
      fetching = true;
      try {
        const cursor = cursorRef.current;
        const result = await api<{ messages: CourseMessage[] }>(
          `/courses/${courseId}/messages${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`,
          { token },
        );
        if (!active) return;
        if (result.messages.length) {
          setMessages((current) => {
            const existing = new Set(current.map((message) => message.id));
            const incoming = result.messages.filter((message) => !existing.has(message.id));
            return [...current, ...incoming];
          });
          cursorRef.current = result.messages[result.messages.length - 1]!.id;
        }
        setChatError("");
      } catch (cause) {
        if (active) setChatError(cause instanceof Error ? cause.message : "চ্যাট লোড করা যায়নি।");
      } finally {
        fetching = false;
        if (active) setLoaded(true);
      }
    }

    void refreshMessages();
    const timer = window.setInterval(() => void refreshMessages(), 4_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [courseId, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setChatError("");
    try {
      const result = await api<{ message: CourseMessage }>(`/courses/${courseId}/messages`, {
        method: "POST",
        token,
        body: { content },
      });
      setMessages((current) => current.some((message) => message.id === result.message.id)
        ? current
        : [...current, result.message]);
      setDraft("");
    } catch (cause) {
      setChatError(cause instanceof Error ? cause.message : "বার্তা পাঠানো যায়নি।");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`course-chat-widget ${isOpen ? "open" : ""}`}>
      {isOpen && (
        <section className="course-chat" id={`course-chat-panel-${courseId}`} aria-label="শিক্ষক ও শিক্ষার্থীর চ্যাট" role="dialog" aria-modal="false">
          <div className="course-chat-heading">
            <span className="course-chat-icon">✉</span>
            <div><h3>শিক্ষকের সঙ্গে কথা বলো</h3><p>কোর্স: {courseTitle}</p></div>
            <span className="course-chat-status"><i /> চ্যাট</span>
            <button className="course-chat-close" type="button" onClick={() => setOpen(false)} aria-label="চ্যাট বন্ধ করো">×</button>
          </div>
          {chatError && <p className="course-chat-error" role="alert">{chatError}</p>}
          <div className="course-chat-messages" aria-live="polite">
            {!loaded ? <p className="course-chat-empty">বার্তা আনা হচ্ছে...</p> : messages.length ? messages.map((message) => (
              <article className={`course-chat-message ${message.sender.id === user.id ? "mine" : ""}`} key={message.id}>
                <span className="course-chat-avatar">{message.sender.name.charAt(0).toUpperCase()}</span>
                <div className="course-chat-bubble">
                  <div><strong>{message.sender.id === user.id ? "তুমি" : message.sender.name}</strong><small>{new Date(message.createdAt).toLocaleString("bn-BD", { dateStyle: "short", timeStyle: "short" })}</small></div>
                  <p>{message.content}</p>
                </div>
              </article>
            )) : <p className="course-chat-empty">এখনো কোনো বার্তা নেই—শিক্ষককে প্রশ্ন করে শুরু করো।</p>}
            <div ref={bottomRef} />
          </div>
          <form className="course-chat-form" onSubmit={(event) => void sendMessage(event)}>
            <label className="sr-only" htmlFor={`course-chat-${courseId}`}>বার্তা লিখুন</label>
            <textarea
              id={`course-chat-${courseId}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="শিক্ষককে প্রশ্ন বা বার্তা লিখো..."
              maxLength={2000}
              rows={2}
              required
            />
            <button className="button button-primary" type="submit" disabled={!loaded || sending || !draft.trim()}>
              {sending ? "পাঠাচ্ছে..." : "পাঠাও"} <span>→</span>
            </button>
          </form>
        </section>
      )}
      <button
        className="course-chat-launcher"
        id="student-chat-section"
        type="button"
        onClick={() => setOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={`course-chat-panel-${courseId}`}
        aria-label={isOpen ? "চ্যাট বন্ধ করো" : "শিক্ষকের সঙ্গে চ্যাট খোলো"}
      >
        <span>{isOpen ? "×" : "✉"}</span>
        {!isOpen && <><strong>শিক্ষককে জিজ্ঞাসা</strong><i /></>}
      </button>
    </div>
  );
}

function BatchView({
  user,
  token,
  batch,
  folders,
  homework,
  onRefresh,
  onError,
  onNotice,
}: {
  user: User;
  token: string;
  batch: Batch;
  folders: Folder[];
  homework: Homework[];
  onRefresh: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const isTeacher = user.role === "TEACHER";
  const [contentType, setContentType] = useState<Content["type"]>("VIDEO");
  const [openHomework, setOpenHomework] = useState("");
  const [playingVideoId, setPlayingVideoId] = useState("");

  async function act(event: FormEvent<HTMLFormElement>, operation: (data: FormData) => Promise<void>, message: string) {
    event.preventDefault();
    onError("");
    const form = event.currentTarget;
    try {
      await operation(new FormData(form));
      form.reset();
      onNotice(message);
      onRefresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "The request could not be completed.");
    }
  }

  const folderOptions = folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.title}</option>);
  const firstHomeworkId = homework[0]?.id;

  return (
    <div className="batch-content">
      <div className="batch-heading">
        <div><span className="batch-heading-icon">▤</span><div><h3>{batch.name}</h3><p>ক্লাসের লেসন ও অ্যাসাইনমেন্ট</p></div></div>
        <span className="live-label">{isTeacher ? "ক্লাস স্পেস" : "ক্লাস ও লেসন"}</span>
      </div>

      {isTeacher && (
        <div className="teacher-tools">
          <details className="tool-panel">
            <summary><span>＋</span> ফোল্ডার যোগ করুন</summary>
            <form className="tool-form" onSubmit={(event) => void act(event, async (form) => {
              await api("/folders", { method: "POST", token, body: { title: form.get("title"), batchId: batch.id } });
            }, "Folder added.")}>
              <input name="title" placeholder="ফোল্ডারের নাম" required maxLength={200} />
              <button className="button button-primary" type="submit">ফোল্ডার যোগ</button>
            </form>
          </details>
          {folders.length > 0 && (
            <details className="tool-panel">
              <summary><span>＋</span> লেসন যোগ করুন</summary>
              <form className="tool-form tool-form-wrap" onSubmit={(event) => void act(event, async (form) => {
                const type = String(form.get("type")) as Content["type"];
                const contentData = type === "TEXT"
                  ? { textContent: form.get("textContent") }
                  : {
                    [type === "VIDEO" ? "videoUrl" : type === "LIVE_LINK" ? "liveUrl" : "documentUrl"]:
                      form.get("url"),
                  };
                await api("/content", {
                  method: "POST",
                  token,
                  body: { title: form.get("title"), type, folderId: form.get("folderId"), ...contentData },
                });
              }, "Lesson added.")}>
                <input name="title" placeholder="লেসনের নাম" required maxLength={200} />
                <select name="folderId" required defaultValue="">{folderOptions}<option value="" disabled>ফোল্ডার বেছে নিন</option></select>
                <select name="type" value={contentType} onChange={(event) => setContentType(event.target.value as Content["type"])}>
                  <option value="VIDEO">ভিডিও</option><option value="LIVE_LINK">লাইভ ক্লাসের লিংক</option><option value="DOCUMENT">ডকুমেন্ট</option><option value="TEXT">লিখিত লেসন</option>
                </select>
                {contentType === "TEXT"
                  ? <textarea name="textContent" placeholder="শিক্ষার্থীদের জন্য লেসনটি লিখুন..." rows={4} maxLength={20000} required />
                  : <input
                    name="url"
                    type="url"
                    placeholder={contentType === "VIDEO" ? "YouTube বা ভিডিও URL (YouTube লিংক এমবেড হবে)" : "https://..."}
                    required
                  />}
                <button className="button button-primary" type="submit">লেসন যোগ</button>
              </form>
            </details>
          )}
          {folders.length > 0 && (
            <details className="tool-panel">
              <summary><span>＋</span> অ্যাসাইনমেন্ট যোগ করুন</summary>
              <form className="tool-form tool-form-wrap" onSubmit={(event) => void act(event, async (form) => {
                await api("/homework", {
                  method: "POST",
                  token,
                  body: {
                    title: form.get("title"),
                    description: form.get("description") || undefined,
                    dueDate: new Date(String(form.get("dueDate"))).toISOString(),
                    folderId: form.get("folderId"),
                  },
                });
              }, "Assignment added.")}>
                <input name="title" placeholder="অ্যাসাইনমেন্টের নাম" required maxLength={200} />
                <input name="description" placeholder="নির্দেশনা (ঐচ্ছিক)" maxLength={10000} />
                <select name="folderId" required defaultValue="">{folderOptions}<option value="" disabled>ফোল্ডার বেছে নিন</option></select>
                <label className="date-field">জমা দেওয়ার তারিখ<input name="dueDate" type="datetime-local" required /></label>
                <button className="button button-primary" type="submit">অ্যাসাইনমেন্ট তৈরি</button>
              </form>
            </details>
          )}
        </div>
      )}
      {folders.length === 0 ? (
        <EmptyState icon="✧" title="এখানে এখনো কিছু নেই" text={isTeacher ? "তোমার ক্লাস গুছিয়ে নিতে উপরে একটি ফোল্ডার যোগ করো।" : "তোমার শিক্ষক এখনো কোনো লার্নিং ম্যাটেরিয়াল যোগ করেননি।"} />
      ) : (
        <div className="folder-list">
          {folders.map((folder) => (
            <section className="folder-card" key={folder.id}>
              <div className="folder-title"><span className="folder-icon">▱</span><h4>{folder.title}</h4><span className="folder-count">{formatNumber(folder.contents.length)}টি লেসন</span></div>
              {folder.contents.length > 0 && (
                <div className="material-list">
                  {folder.contents.filter((item) => isTeacher || item.type !== "LIVE_LINK").map((item) => {
                    const itemUrl = item.type === "LIVE_LINK"
                      ? item.liveUrl
                      : item.type === "DOCUMENT"
                        ? item.documentUrl
                        : null;
                    const isPlaying = playingVideoId === item.id;
                    return (
                      <div className="material-item" key={item.id}>
                        <div className="material-row">
                          <span className={`material-icon ${item.type.toLowerCase()}`}>{item.type === "VIDEO" ? "▶" : item.type === "LIVE_LINK" ? "↗" : item.type === "TEXT" ? "T" : "▤"}</span>
                          <span className="material-name">
                            {item.title}
                            <small>{item.type === "TEXT" ? "Written lesson" : item.type.replace("_", " ")}</small>
                            {item.type === "TEXT" && item.textContent && <span className="material-text">{item.textContent}</span>}
                          </span>
                          {item.type === "VIDEO" && item.videoUrl
                            ? <button className="text-link video-play-button" type="button" onClick={() => setPlayingVideoId(isPlaying ? "" : item.id)}>{isPlaying ? "বন্ধ করুন" : "▶ ভিডিও চালান"}</button>
                            : itemUrl
                              ? <a className="text-link" href={itemUrl} target="_blank" rel="noreferrer">খুলুন ↗</a>
                              : item.type === "VIDEO" && user.role !== "STUDENT" && <span className="protected-label">ভিডিও লিংক যোগ করা হয়নি</span>}
                        </div>
                        {isPlaying && item.videoUrl && (
                          <div className="lesson-video-player">
                            <VideoPlayer videoUrl={item.videoUrl} title={item.title} />
                            {!youtubeEmbedUrl(item.videoUrl) && <small>ভিডিও দেখা যাবে; তবে DRM ছাড়া download বা screen recording পুরোপুরি আটকানো সম্ভব নয়।</small>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {isTeacher && folder.homework.length > 0 && (
                <div className="assignment-list" id={folder.homework.some((item) => item.id === firstHomeworkId) ? "student-assignment-list" : undefined}>
                  {folder.homework.map((assignment) => (
                    <HomeworkRow
                      key={assignment.id}
                      homework={assignment}
                      user={user}
                      token={token}
                      open={openHomework === assignment.id}
                      onToggle={() => setOpenHomework(openHomework === assignment.id ? "" : assignment.id)}
                      onError={onError}
                      onNotice={onNotice}
                      onRefresh={onRefresh}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {isTeacher && homework.some((item) => !folders.some((folder) => folder.homework.some((folderItem) => folderItem.id === item.id))) && (
        <section className="folder-card ungrouped-homework" id={!folders.some((folder) => folder.homework.some((item) => item.id === firstHomeworkId)) ? "student-assignment-list" : undefined}>
          <div className="folder-title"><span className="folder-icon">✎</span><h4>অ্যাসাইনমেন্ট</h4></div>
          {homework
            .filter((item) => !folders.some((folder) => folder.homework.some((folderItem) => folderItem.id === item.id)))
            .map((item) => (
              <HomeworkRow key={item.id} homework={item} user={user} token={token} open={openHomework === item.id}
                onToggle={() => setOpenHomework(openHomework === item.id ? "" : item.id)} onError={onError} onNotice={onNotice} onRefresh={onRefresh} />
            ))}
        </section>
      )}
    </div>
  );
}

function HomeworkRow({
  homework,
  user,
  token,
  open,
  onToggle,
  onError,
  onNotice,
  onRefresh,
}: {
  homework: Homework;
  user: User;
  token: string;
  open: boolean;
  onToggle: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  onRefresh: () => void;
}) {
  const submitted = homework.submissions?.[0];
  return (
    <div className="homework-item">
      <button className="homework-row" onClick={onToggle}>
        <span className="material-icon assignment">✎</span>
        <span className="material-name">{homework.title}<small>জমা দিতে হবে {new Date(homework.dueDate).toLocaleString("bn-BD")}</small></span>
        {user.role === "STUDENT" && (submitted ? <span className="status-pill complete">জমা হয়েছে</span> : <span className="status-pill pending">বাকি</span>)}
        <span className="row-chevron">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="homework-detail">
          {homework.description && <p>{homework.description}</p>}
          {user.role === "STUDENT" && (
            <>
              {submitted?.marks !== null && submitted?.marks !== undefined && <p className="grade-note">প্রাপ্ত নম্বর: <strong>{formatNumber(submitted.marks)}</strong></p>}
              <form className="tool-form" onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                onError("");
                const fileUrl = new FormData(form).get("fileUrl");
                api(`/homework/${homework.id}/submissions`, { method: "POST", token, body: { fileUrl } })
                  .then(() => { onNotice("অ্যাসাইনমেন্ট জমা হয়েছে।"); onRefresh(); })
                  .catch((cause: unknown) => onError(cause instanceof Error ? cause.message : "Could not submit assignment."));
              }}>
                <input name="fileUrl" type="url" placeholder="Paste your submission link" defaultValue={submitted?.fileUrl ?? ""} required />
                <button className="button button-primary" type="submit">{submitted ? "জমা আপডেট করুন" : "কাজ জমা দিন"}</button>
              </form>
            </>
          )}
          {user.role === "TEACHER" && homework.submissions?.length ? (
            <div className="submission-list">
              {homework.submissions.map((submission) => (
                <div className="submission-row" key={submission.id}>
                  <a className="text-link" href={submission.fileUrl ?? "#"} target="_blank" rel="noreferrer">View submission ↗</a>
                  <form className="grade-form" onSubmit={(event) => {
                    event.preventDefault();
                    const marks = new FormData(event.currentTarget).get("marks");
                    api(`/submissions/${submission.id}/grade`, { method: "PATCH", token, body: { marks: Number(marks) } })
                      .then(() => { onNotice("নম্বর সংরক্ষণ হয়েছে।"); onRefresh(); })
                      .catch((cause: unknown) => onError(cause instanceof Error ? cause.message : "Could not save grade."));
                  }}>
                    <input name="marks" type="number" min="0" max="1000" step="0.5" placeholder="নম্বর" defaultValue={submission.marks ?? ""} required />
                    <button className="button button-outline" type="submit">Save grade</button>
                  </form>
                </div>
              ))}
            </div>
          ) : null}
          {user.role === "TEACHER" && !homework.submissions?.length && <p className="muted-copy">No submissions yet.</p>}
        </div>
      )}
    </div>
  );
}

function ProgressView({ progress }: { progress: ProgressBatch[] }) {
  const totals = useMemo(() => progress.reduce((value, batch) => ({
    videos: value.videos + batch.totalVideos,
    completed: value.completed + batch.completedVideos,
  }), { videos: 0, completed: 0 }), [progress]);
  return (
    <>
      <div className="stats-grid">
        <StatCard label="ক্লাসে ভর্তি" value={formatNumber(progress.length, 2)} icon="▤" color="mint" />
        <StatCard label="ভিডিও সম্পন্ন" value={`${formatNumber(totals.completed)}/${formatNumber(totals.videos)}`} icon="✓" color="lavender" />
        <StatCard label="সামগ্রিক অগ্রগতি" value={`${formatNumber(totals.videos ? Math.round(totals.completed / totals.videos * 100) : 0)}%`} icon="◷" color="peach" />
      </div>
      <div className="section-heading progress-heading"><div><h2>ক্লাস অনুযায়ী অগ্রগতি</h2><p>প্রতিটি ক্লাসে তোমার শেখার অগ্রগতি দেখে নাও।</p></div></div>
      {progress.length ? (
        <div className="progress-list">
          {progress.map((batch) => (
            <article className="progress-card" key={batch.batchId}>
              <div className="progress-card-top"><div><span className="progress-course-icon">✳</span><div><h3>{batch.course.title}</h3><p>{batch.batchName}</p></div></div><strong>{formatNumber(batch.completionPercentage)}%</strong></div>
              <div className="progress-track"><i style={{ width: `${batch.completionPercentage}%` }} /></div>
              <div className="progress-foot"><span>{formatNumber(batch.totalVideos)}টির মধ্যে {formatNumber(batch.completedVideos)}টি ভিডিও সম্পন্ন</span><span>{formatDuration(batch.watchDuration)} দেখা হয়েছে</span></div>
            </article>
          ))}
        </div>
      ) : <EmptyState icon="◷" title="তোমার অগ্রগতি এখান থেকেই শুরু" text="ক্লাসে যুক্ত হলে শেখার প্রতিটি মাইলফলক এখানে দেখতে পাবে।" />}
    </>
  );
}

function isProfileComplete(profile: StudentProfile) {
  return Boolean(
    profile.name.trim()
    && profile.phone?.trim()
    && profile.fatherName?.trim()
    && profile.motherName?.trim()
    && profile.className?.trim(),
  );
}

function StudentProfileForm({
  profile,
  onSubmit,
}: {
  profile: StudentProfile;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="student-profile-form" onSubmit={onSubmit}>
      <label>শিক্ষার্থীর পূর্ণ নাম<input name="name" defaultValue={profile.name} autoComplete="name" required maxLength={120} /></label>
      <label>মোবাইল নম্বর<input name="phone" type="tel" defaultValue={profile.phone ?? ""} autoComplete="tel" required minLength={7} maxLength={30} /></label>
      <label>বাবার নাম<input name="fatherName" defaultValue={profile.fatherName ?? ""} required maxLength={120} /></label>
      <label>মায়ের নাম<input name="motherName" defaultValue={profile.motherName ?? ""} required maxLength={120} /></label>
      <label>শ্রেণি / শিক্ষাবর্ষ<input name="className" defaultValue={profile.className ?? ""} placeholder="যেমন: ৮ম শ্রেণি" required maxLength={80} /></label>
      <button className="button button-primary" type="submit">প্রোফাইল সংরক্ষণ করো <span>→</span></button>
    </form>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return <article className="stat-card"><span className={`stat-icon ${color}`}>{icon}</span><span className="stat-label">{label}</span><strong>{value}</strong></article>;
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p></div>;
}

function roleLabel(role: Role) {
  return role === "SUPER_ADMIN" ? "সুপার অ্যাডমিন" : role === "TEACHER" ? "শিক্ষক" : "শিক্ষার্থী";
}

function dashboardGreeting(name: string) {
  const hour = new Date().getHours();
  const salutation = hour < 12 ? "শুভ সকাল" : hour < 18 ? "শুভ অপরাহ্ণ" : "শুভ সন্ধ্যা";
  return `${salutation}, ${name.split(" ")[0]}!`;
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${formatNumber(hours)} ঘণ্টা ${formatNumber(minutes)} মিনিট` : `${formatNumber(minutes)} মিনিট`;
}

function formatNumber(value: number, minimumIntegerDigits = 1) {
  return new Intl.NumberFormat("bn-BD", { minimumIntegerDigits }).format(value);
}

export default App;
