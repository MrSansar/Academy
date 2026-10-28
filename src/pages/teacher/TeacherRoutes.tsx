import { Route, Routes } from 'react-router'
import { NotFound } from '../../components/ui'
import { AssignmentDashboard } from './AssignmentDashboard'
import { AssignmentEditor } from './AssignmentEditor'
import { ClassPage } from './ClassPage'
import { CourseLessons } from './CourseLessons'
import { LessonEditor } from './LessonEditor'
import { TeachHome } from './TeachHome'

export default function TeacherRoutes() {
  return (
    <Routes>
      <Route index element={<TeachHome />} />
      <Route path="courses/:courseId" element={<CourseLessons />} />
      <Route path="courses/:courseId/lessons/new" element={<LessonEditor />} />
      <Route path="lessons/:lessonId" element={<LessonEditor />} />
      <Route path="classes/:classId" element={<ClassPage />} />
      <Route path="classes/:classId/assignments/new" element={<AssignmentEditor />} />
      <Route path="assignments/:assignmentId" element={<AssignmentDashboard />} />
      <Route path="assignments/:assignmentId/edit" element={<AssignmentEditor />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
