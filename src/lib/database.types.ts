export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      assignment_lessons: {
        Row: {
          assignment_id: string
          lesson_id: string
          position: number
        }
        Insert: {
          assignment_id: string
          lesson_id: string
          position?: number
        }
        Update: {
          assignment_id?: string
          lesson_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignment_lessons_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_lessons_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          class_id: string
          created_at: string
          due_at: string
          id: string
          instructions: string
          title: string
        }
        Insert: {
          class_id: string
          created_at?: string
          due_at: string
          id?: string
          instructions?: string
          title: string
        }
        Update: {
          class_id?: string
          created_at?: string
          due_at?: string
          id?: string
          instructions?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          archived: boolean
          course_id: string
          created_at: string
          id: string
          join_code: string
          name: string
        }
        Insert: {
          archived?: boolean
          course_id: string
          created_at?: string
          id?: string
          join_code?: string
          name: string
        }
        Update: {
          archived?: boolean
          course_id?: string
          created_at?: string
          id?: string
          join_code?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      confusion_notes: {
        Row: {
          body: string
          created_at: string
          id: number
          lesson_id: string
          student_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: never
          lesson_id: string
          student_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: never
          lesson_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "confusion_notes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "confusion_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          description: string
          id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          class_id: string
          joined_at: string
          student_id: string
        }
        Insert: {
          class_id: string
          joined_at?: string
          student_id: string
        }
        Update: {
          class_id?: string
          joined_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed_at: string | null
          duration_seconds: number | null
          first_opened_at: string
          last_position: number
          last_watched_at: string | null
          lesson_id: string
          percent_watched: number
          student_id: string
          updated_at: string
          watched_intervals: Json
          watched_seconds: number
        }
        Insert: {
          completed_at?: string | null
          duration_seconds?: number | null
          first_opened_at?: string
          last_position?: number
          last_watched_at?: string | null
          lesson_id: string
          percent_watched?: number
          student_id: string
          updated_at?: string
          watched_intervals?: Json
          watched_seconds?: number
        }
        Update: {
          completed_at?: string | null
          duration_seconds?: number | null
          first_opened_at?: string
          last_position?: number
          last_watched_at?: string | null
          lesson_id?: string
          percent_watched?: number
          student_id?: string
          updated_at?: string
          watched_intervals?: Json
          watched_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          check_enabled: boolean
          confusion_enabled: boolean
          course_id: string
          created_at: string
          duration_seconds: number
          id: string
          position: number
          summary: string
          title: string
          transcript: string | null
          updated_at: string
          youtube_id: string
        }
        Insert: {
          check_enabled?: boolean
          confusion_enabled?: boolean
          course_id: string
          created_at?: string
          duration_seconds: number
          id?: string
          position?: number
          summary?: string
          title: string
          transcript?: string | null
          updated_at?: string
          youtube_id: string
        }
        Update: {
          check_enabled?: boolean
          confusion_enabled?: boolean
          course_id?: string
          created_at?: string
          duration_seconds?: number
          id?: string
          position?: number
          summary?: string
          title?: string
          transcript?: string | null
          updated_at?: string
          youtube_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      question_attempts: {
        Row: {
          chosen_index: number
          created_at: string
          id: number
          is_correct: boolean
          question_id: string
          student_id: string
        }
        Insert: {
          chosen_index: number
          created_at?: string
          id?: never
          is_correct: boolean
          question_id: string
          student_id: string
        }
        Update: {
          chosen_index?: number
          created_at?: string
          id?: never
          is_correct?: boolean
          question_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_keys: {
        Row: {
          correct_index: number
          explanation: string
          question_id: string
        }
        Insert: {
          correct_index: number
          explanation?: string
          question_id: string
        }
        Update: {
          correct_index?: number
          explanation?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          choices: Json
          created_at: string
          id: string
          lesson_id: string
          position: number
          prompt: string
        }
        Insert: {
          choices: Json
          created_at?: string
          id?: string
          lesson_id: string
          position?: number
          prompt: string
        }
        Update: {
          choices?: Json
          created_at?: string
          id?: string
          lesson_id?: string
          position?: number
          prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      join_class: { Args: { p_code: string }; Returns: string }
      join_code_is_valid: { Args: { p_code: string }; Returns: boolean }
      open_lesson: {
        Args: { p_lesson_id: string }
        Returns: {
          completed_at: string | null
          duration_seconds: number | null
          first_opened_at: string
          last_position: number
          last_watched_at: string | null
          lesson_id: string
          percent_watched: number
          student_id: string
          updated_at: string
          watched_intervals: Json
          watched_seconds: number
        }
        SetofOptions: {
          from: "*"
          to: "lesson_progress"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_progress: {
        Args: {
          p_duration?: number
          p_intervals: Json
          p_lesson_id: string
          p_position?: number
        }
        Returns: {
          completed_at: string | null
          duration_seconds: number | null
          first_opened_at: string
          last_position: number
          last_watched_at: string | null
          lesson_id: string
          percent_watched: number
          student_id: string
          updated_at: string
          watched_intervals: Json
          watched_seconds: number
        }
        SetofOptions: {
          from: "*"
          to: "lesson_progress"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_answer: {
        Args: { p_choice: number; p_question_id: string }
        Returns: {
          explanation: string
          is_correct: boolean
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

