export interface Subject {
  id: string;
  name: string;
  description: string;
  icon_key: string;
  color_hex: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface QuestionBank {
  id: string;
  title: string;
  description: string;
  subject_id?: string | null;
  subject_name?: string | null;
  subject_hint: string;
  source_type?: string;
  question_count: number;
  linked_quiz_count?: number;
  created_at: string;
}

export interface Quiz {
  id: string;
  subject_id: string;
  title: string;
  description: string;
  time_per_question_sec: number;
  points_per_correct: number;
  is_active: boolean;
  bank_ids?: string[];
  question_count?: number;
  created_at: string;
}

export type CorrectOption = 'A' | 'B' | 'C' | 'D';

export interface Question {
  id: string;
  bank_id: string;
  quiz_id?: string | null;
  question_text: string;
  expression_text: string | null;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: CorrectOption;
  explanation: string;
  created_at?: string;
}

export interface Student {
  id: string;
  phone: string;
  full_name: string;
  device_id: string;
  recovery_code: string;
  first_name: string;
  last_name: string;
  region: string;
  total_points: number;
  streak_days: number;
  daily_questions_count: number;
  daily_goal_target: number;
  last_active_date: string;
  last_active_at: string;
  created_at: string;
}

export interface TestAttemptRow {
  id: string;
  student_id: string;
  subject_id: string;
  quiz_id: string;
  requested_count: number;
  total_questions: number;
  correct_count: number;
  wrong_count: number;
  earned_points: number;
  duration_sec: number;
  score_percent: number;
  completed_at: string;
  students?: {
    first_name: string;
    last_name: string;
    full_name?: string;
    phone?: string;
    region: string;
  };
  subjects?: {
    name: string;
  };
  quizzes?: {
    title: string;
  };
}

export interface DashboardStats {
  total_students: number;
  active_today: number;
  total_attempts: number;
  avg_score_percent: number;
  total_subjects: number;
  total_quizzes: number;
  total_banks?: number;
  total_questions: number;
}

export interface ParsedQuestionInput {
  question_text: string;
  expression_text: string | null;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: CorrectOption;
  explanation: string;
}

export interface ParseResult {
  valid: ParsedQuestionInput[];
  errors: string[];
}

