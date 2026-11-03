import { Route, Routes } from 'react-router'
import { NotFound } from '../../components/ui'
import { AssignmentDashboard } from './AssignmentDashboard'
import { AssignmentEditor } from './AssignmentEditor'
import { ClassesPage } from './ClassesPage'
import { ClassPage } from './ClassPage'
import { CourseLessons } from './CourseLessons'
import { CoursesPage } from './CoursesPage'
import { Dashboard } from './Dashboard'
import { LessonEditor } from './LessonEditor'
import { NotesPage } from './NotesPage'
import { StudentPage } from './StudentPage'

/**
 * Teacher sections, matching the top nav:
 *   Dashboard  /teach
 *   Classes    /teach/classes → class → student, assignment report, assignment editor
 *   Lessons    /teach/courses → course → lesson editor
 *   Notes      /teach/notes
 */
export default function TeacherRoutes() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="classes" element={<ClassesPage />} />
      <Route path="classes/:classId" element={<ClassPage />} />
      <Route path="classes/:classId/students/:studentId" element={<StudentPage />} />
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
