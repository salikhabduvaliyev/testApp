import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Users,
} from 'lucide-react';
import { DashboardTab } from './components/DashboardTab';
import { LoginView } from './components/LoginView';
import { QuestionsTab } from './components/QuestionsTab';
import { ResultsTab, StudentsTab } from './components/StudentsResultsTab';
import { SubjectsQuizzesTab } from './components/SubjectsQuizzesTab';
import { ApiError, adminApi } from './lib/api';
import type {
  DashboardStats,
  ParsedQuestionInput,
  Question,
  QuestionBank,
  Quiz,
  Student,
  Subject,
  TestAttemptRow,
} from './types';

type NavTab = 'dashboard' | 'subjects' | 'questions' | 'students' | 'results';

const EMPTY_STATS: DashboardStats = {
  total_students: 0,
  active_today: 0,
  total_attempts: 0,
  avg_score_percent: 0,
  total_subjects: 0,
  total_quizzes: 0,
  total_banks: 0,
  total_questions: 0,
};

export function App() {
  const [mode, setMode] = useState<'checking' | 'login' | 'live'>('checking');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');

  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attempts, setAttempts] = useState<TestAttemptRow[]>([]);

  const [jumpBankId, setJumpBankId] = useState<string | undefined>();
  const [openUploadOnTab, setOpenUploadOnTab] = useState(false);
  const [questionsViewKey, setQuestionsViewKey] = useState(0);

  const loadLiveData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.overview();
      setStats(data.stats);
      setSubjects(data.subjects);
      setBanks(data.banks || []);
      setQuizzes(data.quizzes);
      setQuestions(data.questions);
      setStudents(data.students);
      setAttempts(data.attempts);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setMode('login');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function checkSession() {
      try {
        const me = await adminApi.me();
        if (me.authenticated) {
          setAdminUsername(me.username);
          setMode('live');
          void loadLiveData();
          return;
        }
      } catch {
        // Not authenticated
      }
      setMode('login');
    }
    void checkSession();
  }, [loadLiveData]);

  // Real-time Server-Sent Events when students submit tests in APK or database changes
  useEffect(() => {
    if (mode !== 'live') return;
    const source = new EventSource('/api/admin/events');
    const refresh = () => void loadLiveData();

    for (const evt of ['subjects', 'banks', 'quizzes', 'questions', 'student_joined', 'attempt_submitted']) {
      source.addEventListener(evt, refresh);
    }

    return () => {
      source.close();
    };
  }, [mode, loadLiveData]);

  const handleLogout = async () => {
    try {
      await adminApi.logout();
    } catch {
      // ignore logout error
    }
    setMode('login');
  };

  const withReload = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      const result = await fn();
      await loadLiveData();
      return result;
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Saqlashda xatolik yuz berdi');
      return undefined;
    }
  };

  const createSubject = async (payload: Omit<Subject, 'id' | 'created_at'>) => {
    await withReload(() => adminApi.createSubject(payload));
  };

  const updateSubject = async (id: string, payload: Partial<Subject>) => {
    await withReload(() => adminApi.updateSubject(id, payload));
  };

  const deleteSubject = async (id: string) => {
    await withReload(() => adminApi.deleteSubject(id));
  };

  const createBank = (payload: {
    title: string;
    description?: string;
    subject_id?: string | null;
    subject_hint?: string;
    source_type?: string;
    auto_create_quiz?: boolean;
    time_per_question_sec?: number;
    points_per_correct?: number;
    questions?: ParsedQuestionInput[];
  }) => withReload(() => adminApi.createBank(payload));

  const updateBank = async (id: string, payload: Partial<QuestionBank>) => {
    await withReload(() => adminApi.updateBank(id, payload));
  };

  const deleteBank = async (id: string) => {
    await withReload(() => adminApi.deleteBank(id));
  };

  const createQuiz = async (payload: Omit<Quiz, 'id' | 'created_at' | 'question_count'>) => {
    await withReload(() => adminApi.createQuiz(payload));
  };

  const updateQuiz = async (id: string, payload: Partial<Quiz>) => {
    await withReload(() => adminApi.updateQuiz(id, payload));
  };

  const deleteQuiz = async (id: string) => {
    await withReload(() => adminApi.deleteQuiz(id));
  };

  const addQuestions = async (bankId: string, rows: ParsedQuestionInput[]) => {
    await withReload(() => adminApi.addQuestions(bankId, rows));
  };

  const updateQuestion = async (id: string, payload: Partial<Question>) => {
    await withReload(() => adminApi.updateQuestion(id, payload));
  };

  const deleteQuestion = async (id: string) => {
    await withReload(() => adminApi.deleteQuestion(id));
  };

  if (mode === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-600 text-sm">
        Yuklanmoqda...
      </div>
    );
  }

  if (mode === 'login') {
    return (
      <LoginView
        onLoginSuccess={(username) => {
          setAdminUsername(username);
          setMode('live');
          void loadLiveData();
        }}
      />
    );
  }

  const navItems: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Boshqaruv paneli', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'subjects', label: 'Fanlar va Testlar', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'questions', label: 'Testlar', icon: <FileText className="w-4 h-4" /> },
    { id: 'students', label: 'Foydalanuvchilar', icon: <Users className="w-4 h-4" /> },
    { id: 'results', label: 'Test natijalari', icon: <ClipboardList className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-slate-200 p-4 flex flex-col justify-between shrink-0">
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2 px-2 pt-1">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                D
              </div>
              <div>
                <div className="font-bold text-slate-900 leading-tight">DONO Admin</div>
                <div className="text-[11px] text-slate-500">SQLite baza · {adminUsername}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Chiqish"
              className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <nav className="flex md:flex-col gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setJumpBankId(undefined);
                    setOpenUploadOnTab(false);
                    if (item.id === 'questions') {
                      setQuestionsViewKey((k) => k + 1);
                    }
                    setActiveTab(item.id);
                  }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition ${
                    active
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="hidden md:flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition mt-4"
        >
          <LogOut className="w-4 h-4" />
          Chiqish
        </button>
      </aside>

      <main className="flex-1 p-5 md:p-8 max-w-7xl w-full mx-auto">
        {activeTab === 'dashboard' && (
          <DashboardTab
            stats={stats}
            recentAttempts={attempts.slice(0, 15)}
            isLive={true}
            loading={loading}
            onRefresh={() => void loadLiveData()}
            onGoToUpload={() => {
              setJumpBankId(undefined);
              setOpenUploadOnTab(true);
              setActiveTab('questions');
            }}
          />
        )}
        {activeTab === 'subjects' && (
          <SubjectsQuizzesTab
            subjects={subjects}
            quizzes={quizzes}
            banks={banks}
            questions={questions}
            onCreateSubject={createSubject}
            onUpdateSubject={updateSubject}
            onDeleteSubject={deleteSubject}
            onCreateQuiz={createQuiz}
            onUpdateQuiz={updateQuiz}
            onDeleteQuiz={deleteQuiz}
            onOpenBank={(bankId) => {
              setJumpBankId(bankId);
              setActiveTab('questions');
            }}
          />
        )}
        {activeTab === 'questions' && (
          <QuestionsTab
            key={questionsViewKey}
            subjects={subjects}
            banks={banks}
            quizzes={quizzes}
            questions={questions}
            initialBankId={jumpBankId}
            initialOpenUpload={openUploadOnTab}
            onConsumeIntent={() => {
              setJumpBankId(undefined);
              setOpenUploadOnTab(false);
            }}
            onCreateBank={createBank}
            onUpdateBank={updateBank}
            onDeleteBank={deleteBank}
            onAddQuestions={addQuestions}
            onUpdateQuestion={updateQuestion}
            onDeleteQuestion={deleteQuestion}
          />
        )}
        {activeTab === 'students' && <StudentsTab students={students} attempts={attempts} />}
        {activeTab === 'results' && <ResultsTab attempts={attempts} subjects={subjects} />}
      </main>
    </div>
  );
}
export default App;
