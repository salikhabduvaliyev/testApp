import type {
  DashboardStats,
  ParsedQuestionInput,
  ParseResult,
  Question,
  QuestionBank,
  Quiz,
  Student,
  Subject,
  TestAttemptRow,
} from '../types';

export interface AdminOverviewResponse {
  stats: DashboardStats;
  subjects: Subject[];
  banks: QuestionBank[];
  quizzes: Quiz[];
  questions: Question[];
  students: Student[];
  attempts: TestAttemptRow[];
}

export function formatUzDateTime(value?: string | null): string {
  if (!value) return '—';
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { message: text };
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, (data.message as string) || `Server xatoligi (${res.status})`);
  }
  return data as T;
}

export const adminApi = {
  me: () => request<{ authenticated: boolean; username: string }>('/api/admin/me'),

  login: (username: string, password: string) =>
    request<{ ok: boolean; username: string; full_name: string }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => request<{ ok: boolean }>('/api/admin/logout', { method: 'POST' }),

  overview: () => request<AdminOverviewResponse>('/api/admin/overview'),

  createSubject: (payload: Omit<Subject, 'id' | 'created_at'>) =>
    request<{ id: string }>('/api/admin/subjects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSubject: (id: string, payload: Partial<Subject>) =>
    request<{ ok: boolean }>(`/api/admin/subjects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteSubject: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/subjects/${id}`, {
      method: 'DELETE',
    }),

  parseTestFile: async (file: File): Promise<ParseResult> => {
    const res = await fetch('/api/admin/parse-test-file', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
      },
      body: file,
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    if (text) {
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        data = { message: text };
      }
    }
    if (!res.ok) {
      throw new ApiError(res.status, (data.message as string) || `Faylni o‘qishda xatolik (${res.status})`);
    }
    return data as unknown as ParseResult;
  },

  createBank: (payload: {
    title: string;
    description?: string;
    subject_id?: string | null;
    subject_hint?: string;
    source_type?: string;
    auto_create_quiz?: boolean;
    time_per_question_sec?: number;
    points_per_correct?: number;
    questions?: ParsedQuestionInput[];
  }) =>
    request<{ id: string; quiz_id?: string | null; inserted: number }>('/api/admin/banks', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateBank: (id: string, payload: Partial<QuestionBank>) =>
    request<{ ok: boolean }>(`/api/admin/banks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteBank: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/banks/${id}`, {
      method: 'DELETE',
    }),

  createQuiz: (payload: Omit<Quiz, 'id' | 'created_at' | 'question_count'>) =>
    request<{ id: string }>('/api/admin/quizzes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateQuiz: (id: string, payload: Partial<Quiz>) =>
    request<{ ok: boolean }>(`/api/admin/quizzes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteQuiz: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/quizzes/${id}`, {
      method: 'DELETE',
    }),

  addQuestions: (bank_id: string, questions: ParsedQuestionInput[]) =>
    request<{ inserted: number }>('/api/admin/questions', {
      method: 'POST',
      body: JSON.stringify({ bank_id, questions }),
    }),

  updateQuestion: (id: string, payload: Partial<Question>) =>
    request<{ ok: boolean }>(`/api/admin/questions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteQuestion: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/questions/${id}`, {
      method: 'DELETE',
    }),
};
