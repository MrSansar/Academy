import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { useAuth } from './auth/AuthProvider'
import { Layout } from './components/Layout'
import { Loading, NotFound } from './components/ui'
import { supabaseConfigured } from './lib/supabase'
import { ResetPassword, SetPassword } from './pages/auth/PasswordPages'
import { SignIn } from './pages/auth/SignIn'
import { SignUp } from './pages/auth/SignUp'
import { Home } from './pages/student/Home'
import { Join } from './pages/student/Join'
import { LessonPage } from './pages/student/LessonPage'
import { MyProgress } from './pages/student/MyProgress'

// Teacher pages load on demand so students on phones download less.
const TeacherRoutes = lazy(() => import('./pages/teacher/TeacherRoutes'))

export default function App() {
  const { session, profile, loading, recovering, isTeacher } = useAuth()
  const location = useLocation()

  if (!supabaseConfigured) return <NotConfigured />
  if (loading) return <Loading label="Loading Chalkline" full />
  if (recovering) return <SetPassword />

  if (!session) {
    return (
      <Routes>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/reset" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />} />
      </Routes>
    )
  }

  if (!profile) return <Loading label="Loading your account" full />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={isTeacher ? <Navigate to="/teach" replace /> : <Home />} />
        <Route path="/join" element={<Join />} />
        <Route path="/progress" element={<MyProgress />} />
        <Route path="/lesson/:lessonId" element={<LessonPage />} />
        <Route
          path="/teach/*"
          element={
            isTeacher ? (
              <Suspense fallback={<Loading />}>
                <TeacherRoutes />
              </Suspense>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="/signin" element={<Navigate to="/" replace />} />
        <Route path="/signup" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  )
}

function NotConfigured() {
  return (
    <main className="page narrow" id="main">
      <h1>Chalkline isn’t connected yet</h1>
      <p>
        Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (in <code>.env.local</code> for
        development, or as GitHub repository variables for the deployed site). See the README.
      </p>
    </main>
  )
}
