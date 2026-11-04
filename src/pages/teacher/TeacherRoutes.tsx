import { Navigate, Route, Routes, useParams } from 'react-router'
import { NotFound } from '../../components/ui'
import { classPath, studentPath } from '../../lib/teacherOverview'
import { AssignmentDashboard } from './AssignmentDashboard'
import { AssignmentEditor } from './AssignmentEditor'
import { CourseLessons } from './CourseLessons'
import { CoursesPage } from './CoursesPage'
import { LessonEditor } from './LessonEditor'
import { NotesPage } from './NotesPage'
import { OverviewPage } from './OverviewPage'
import '../../teacher.css'

/**
 * Teacher sections, matching the top nav:
 *   Overview  /teach (?class=…&student=…)  every class's progress on one screen;
 *             assignment report and editor hang off it
 *   Lessons   /teach/courses → course → lesson editor
 *   Notes     /teach/notes
 */
export default function TeacherRoutes() {
  return (
    <Routes>
      <Route index element={<OverviewPage />} />
      <Route path="classes" element={<Navigate to="/teach" replace />} />
      <Route path="classes/:classId" element={<ClassRedirect />} />
      <Route path="classes/:classId/students/:studentId" element={<ClassRedirect />} />
      <Route path="classes/:classId/assignments/new" element={<AssignmentEditor />} />
      <Route path="assignments/:assignmentId" element={<AssignmentDashboard />} />
      <Route path="assignments/:assignmentId/edit" element={<AssignmentEditor />} />
      <Route path="courses" element={<CoursesPage />} />
      <Route path="courses/:courseId" element={<CourseLessons />} />
      <Route path="courses/:courseId/lessons/new" element={<LessonEditor />} />
      <Route path="lessons/:lessonId" element={<LessonEditor />} />
      <Route path="notes" element={<NotesPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

/** Old class and student page links open the same view on the overview. */
function ClassRedirect() {
  const { classId = '', studentId } = useParams()
  return <Navigate to={studentId ? studentPath(classId, studentId) : classPath(classId)} replace />
}
