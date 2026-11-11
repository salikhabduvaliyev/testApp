import { useState } from 'react';
import {
  CheckSquare,
  Clock,
  Database,
  FolderPlus,
  Layers,
  Pencil,
  Plus,
  Search,
  Shuffle,
  Square,
  Trash2,
} from 'lucide-react';
import type { Question, QuestionBank, Quiz, Subject } from '../types';

interface SubjectsQuizzesTabProps {
  subjects: Subject[];
  quizzes: Quiz[];
  banks: QuestionBank[];
  questions: Question[];
  onCreateSubject: (payload: Omit<Subject, 'id' | 'created_at'>) => Promise<void>;
  onUpdateSubject: (id: string, payload: Partial<Subject>) => Promise<void>;
  onDeleteSubject: (id: string) => Promise<void>;
  onCreateQuiz: (payload: Omit<Quiz, 'id' | 'created_at' | 'question_count'>) => Promise<void>;
  onUpdateQuiz: (id: string, payload: Partial<Quiz>) => Promise<void>;
  onDeleteQuiz: (id: string) => Promise<void>;
  onOpenBank: (bankId?: string) => void;
}

const COLOR_OPTIONS = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DC2626', '#0891B2'];
const ICON_OPTIONS = [
  { key: 'calculate', label: 'Matematika' },
  { key: 'language', label: 'Xorijiy til' },
  { key: 'menu_book', label: 'Adabiyot / Ona tili' },
  { key: 'translate', label: 'Tarjima / Rus tili' },
  { key: 'science', label: 'Kimyo / Biologiya' },
  { key: 'history_edu', label: 'Tarix' },
  { key: 'code', label: 'Informatika' },
  { key: 'public', label: 'Geografiya' },
];

export function SubjectsQuizzesTab({
  subjects,
  quizzes,
  banks,
  questions,
  onCreateSubject,
  onUpdateSubject,
  onDeleteSubject,
  onCreateQuiz,
  onUpdateQuiz,
  onDeleteQuiz,
  onOpenBank,
}: SubjectsQuizzesTabProps) {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(subjects[0]?.id || '');

  // Subject form state
  const [showSubModal, setShowSubModal] = useState(false);
  const [editingSub, setEditingSub] = useState<Subject | null>(null);
  const [subName, setSubName] = useState('');
  const [subDesc, setSubDesc] = useState('');
  const [subColor, setSubColor] = useState('#2563EB');
  const [subIcon, setSubIcon] = useState('menu_book');

  // Quiz form state
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDesc, setQuizDesc] = useState('');
  const [quizTime, setQuizTime] = useState(20);
  const [quizPoints, setQuizPoints] = useState(5);
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [bankFilter, setBankFilter] = useState('');
  const [quizFormError, setQuizFormError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const activeSubject =
    subjects.find((s) => s.id === selectedSubjectId) || subjects[0] || null;

  const subjectQuizzes = activeSubject
    ? quizzes.filter((q) => q.subject_id === activeSubject.id)
    : [];

  const getBankQuestionCount = (bankId: string) =>
    questions.filter((q) => q.bank_id === bankId).length;

  const getQuizQuestionCount = (qz: Quiz) => {
    const ids = new Set(qz.bank_ids || []);
    if (ids.size === 0) return qz.question_count ?? 0;
    return questions.filter((q) => ids.has(q.bank_id)).length;
  };

  const openNewSub = () => {
    setEditingSub(null);
    setSubName('');
    setSubDesc('');
    setSubColor('#2563EB');
    setSubIcon('menu_book');
    setShowSubModal(true);
  };

  const openEditSub = (s: Subject) => {
    setEditingSub(s);
    setSubName(s.name);
    setSubDesc(s.description);
    setSubColor(s.color_hex);
    setSubIcon(s.icon_key);
    setShowSubModal(true);
  };

  const handleSaveSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim()) return;
    setSaving(true);
    try {
      if (editingSub) {
        await onUpdateSubject(editingSub.id, {
          name: subName.trim(),
          description: subDesc.trim(),
          color_hex: subColor,
          icon_key: subIcon,
        });
      } else {
        await onCreateSubject({
          name: subName.trim(),
          description: subDesc.trim(),
          color_hex: subColor,
          icon_key: subIcon,
          sort_order: subjects.length + 1,
          is_active: true,
        });
      }
      setShowSubModal(false);
    } finally {
      setSaving(false);
    }
  };

  const openNewQuiz = () => {
    if (!activeSubject) return;
    setEditingQuiz(null);
    setQuizTitle('');
    setQuizDesc('');
    setQuizTime(20);
    setQuizPoints(5);
    setSelectedBankIds([]);
    setBankFilter('');
    setQuizFormError(null);
    setShowQuizModal(true);
  };

  const openEditQuiz = (q: Quiz) => {
    setEditingQuiz(q);
    setQuizTitle(q.title);
    setQuizDesc(q.description);
    setQuizTime(q.time_per_question_sec);
    setQuizPoints(q.points_per_correct);
    setSelectedBankIds(q.bank_ids || []);
    setBankFilter('');
    setQuizFormError(null);
    setShowQuizModal(true);
  };

  const toggleBankSelection = (bank: QuestionBank) => {
    setQuizFormError(null);
    setSelectedBankIds((prev) => {
      const exists = prev.includes(bank.id);
      const next = exists ? prev.filter((id) => id !== bank.id) : [...prev, bank.id];
      if (!exists && !editingQuiz && !quizTitle.trim()) {
        setQuizTitle(bank.title);
        if (!quizDesc.trim() && bank.description) {
          setQuizDesc(bank.description);
        }
      }
      return next;
    });
  };

  const handleSaveQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSubject || !quizTitle.trim()) return;
    if (selectedBankIds.length === 0) {
      setQuizFormError('Savollar bazasidan kamida bitta test bazasini tanlang.');
      return;
    }
    setSaving(true);
    try {
      if (editingQuiz) {
        await onUpdateQuiz(editingQuiz.id, {
          title: quizTitle.trim(),
          description: quizDesc.trim(),
          time_per_question_sec: Math.max(0, Number(quizTime)),
          points_per_correct: Math.max(1, Number(quizPoints)),
          bank_ids: selectedBankIds,
        });
      } else {
        await onCreateQuiz({
          subject_id: activeSubject.id,
          title: quizTitle.trim(),
          description: quizDesc.trim(),
          time_per_question_sec: Math.max(0, Number(quizTime)),
          points_per_correct: Math.max(1, Number(quizPoints)),
          is_active: true,
          bank_ids: selectedBankIds,
        });
      }
      setShowQuizModal(false);
    } finally {
      setSaving(false);
    }
  };

  const selectedTotalQuestions = selectedBankIds.reduce(
    (sum, bId) => sum + getBankQuestionCount(bId),
    0
  );

  const visibleModalBanks = banks
    .filter((b) => {
      const q = bankFilter.trim().toLowerCase();
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        (b.subject_name || b.subject_hint || '').toLowerCase().includes(q) ||
        (b.description || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const aMatch = activeSubject && a.subject_id === activeSubject.id ? 0 : 1;
      const bMatch = activeSubject && b.subject_id === activeSubject.id ? 0 : 1;
      return aMatch - bMatch;
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Fanlar va Test to‘plamlari</h2>
          <p className="text-sm text-slate-500">
            Fan yarating, “Test to‘plami qo‘shish”da savollar bazasidan testlarni tanlang — APKda savol va variantlar avtomatik chalkashadi
          </p>
        </div>
        <button
          type="button"
          onClick={openNewSub}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
        >
          <FolderPlus className="w-4 h-4" />
          Yangi fan yaratish
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Subjects */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="text-xs font-semibold text-slate-500 uppercase px-2">Fanlar ({subjects.length})</div>
          {subjects.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              Hali fan yaratilmagan. “Yangi fan yaratish” tugmasini bosing.
            </div>
          ) : (
            <div className="space-y-2">
              {subjects.map((sub) => {
                const quizCount = quizzes.filter((q) => q.subject_id === sub.id).length;
                const isSelected = activeSubject?.id === sub.id;
                return (
                  <div
                    key={sub.id}
                    onClick={() => setSelectedSubjectId(sub.id)}
                    className={`cursor-pointer rounded-xl border p-3.5 flex items-center justify-between transition ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
                        style={{ backgroundColor: sub.color_hex }}
                      >
                        {sub.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate flex items-center gap-2">
                          {sub.name}
                          {!sub.is_active && (
                            <span className="text-[11px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                              Yashirin
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {quizCount} ta test to‘plami · {sub.description || 'Izoh yo‘q'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditSub(sub);
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-white hover:text-blue-600"
                        title="Tahrirlash"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`"${sub.name}" fanini va uning test bog‘lanishlarini o‘chirasizmi? (Savollar bazasidagi testlar saqlanadi)`)) {
                            void onDeleteSubject(sub.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-white hover:text-red-600"
                        title="O‘chirish"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Quizzes inside selected Subject */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          {!activeSubject ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Test to‘plamlarini ko‘rish uchun chapdan fanni tanlang.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <div className="text-xs font-semibold uppercase text-blue-600">{activeSubject.name}</div>
                  <h3 className="text-lg font-bold text-slate-900">Test to‘plamlari ({subjectQuizzes.length})</h3>
                </div>
                <button
                  type="button"
                  onClick={openNewQuiz}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition"
                >
                  <Plus className="w-4 h-4" />
                  Test to‘plami qo‘shish
                </button>
              </div>

              {subjectQuizzes.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 bg-slate-50 rounded-xl">
                  Bu fanda hali test to‘plami yo‘q. “+ Test to‘plami qo‘shish”ni bosib, savollar bazasidan test tanlang.
                </div>
              ) : (
                <div className="space-y-3">
                  {subjectQuizzes.map((qz) => {
                    const linkedBanks = banks.filter((b) => (qz.bank_ids || []).includes(b.id));
                    const qCount = getQuizQuestionCount(qz);
                    const supports50 = qCount >= 50;
                    const supports25 = qCount >= 25;
                    const supports10 = qCount >= 10;
                    return (
                      <div
                        key={qz.id}
                        className="rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-300 transition"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="font-semibold text-slate-900 flex items-center gap-2">
                            <Layers className="w-4 h-4 text-blue-600 shrink-0" />
                            <span className="truncate">{qz.title}</span>
                          </div>
                          {qz.description && (
                            <p className="text-xs text-slate-500">{qz.description}</p>
                          )}

                          {/* Linked Question Banks pills */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {linkedBanks.length === 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 text-amber-700 px-2 py-0.5 text-[11px] font-medium">
                                Baza biriktirilmagan
                              </span>
                            ) : (
                              linkedBanks.map((lb) => (
                                <button
                                  key={lb.id}
                                  type="button"
                                  onClick={() => onOpenBank(lb.id)}
                                  className="inline-flex items-center gap-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[11px] font-medium transition"
                                >
                                  <Database className="w-3 h-3" />
                                  {lb.title} ({getBankQuestionCount(lb.id)})
                                </button>
                              ))
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-slate-700 font-medium">
                              <Clock className="w-3.5 h-3.5" />
                              {qz.time_per_question_sec > 0 ? `${qz.time_per_question_sec} soniya/savol` : 'Taymersiz'}
                            </span>
                            <span className="rounded-md bg-blue-50 text-blue-700 px-2 py-0.5 font-medium">
                              {qCount} ta savol
                            </span>
                            <span className="rounded-md bg-emerald-50 text-emerald-700 px-2 py-0.5 font-medium">
                              Rejimlar:{' '}
                              {[supports10 && '10', supports25 && '25', supports50 && '50']
                                .filter(Boolean)
                                .join(' / ') || (qCount > 0 ? `Barchasi (${qCount})` : 'Savol yo‘q')}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 text-violet-700 px-2 py-0.5 font-medium">
                              <Shuffle className="w-3 h-3" />
                              Avto-chalkash
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {linkedBanks[0] && (
                            <button
                              type="button"
                              onClick={() => onOpenBank(linkedBanks[0].id)}
                              className="rounded-lg bg-blue-50 text-blue-700 px-3 py-1.5 text-xs font-semibold hover:bg-blue-100 transition"
                            >
                              Baza ({qCount})
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditQuiz(qz)}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-blue-600"
                            title="Tahrirlash"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                confirm(
                                  `"${qz.title}" test to‘plamini o‘chirasizmi? (Savollar bazasidagi testlar saqlanib qoladi)`
                                )
                              ) {
                                void onDeleteQuiz(qz.id);
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-red-600"
                            title="O‘chirish"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Subject Modal */}
      {showSubModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveSub}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-lg font-bold text-slate-900">
              {editingSub ? 'Fanni tahrirlash' : 'Yangi fan yaratish'}
            </h3>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fan nomi</label>
              <input
                type="text"
                required
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="Masalan, Matematika"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Qisqacha tavsif</label>
              <input
                type="text"
                value={subDesc}
                onChange={(e) => setSubDesc(e.target.value)}
                placeholder="Arifmetika, algebra va mantiqiy masalalar"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ikonka turi</label>
                <select
                  value={subIcon}
                  onChange={(e) => setSubIcon(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
                >
                  {ICON_OPTIONS.map((i) => (
                    <option key={i.key} value={i.key}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rang</label>
                <div className="flex items-center gap-1.5 pt-1.5">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSubColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition ${
                        subColor === c ? 'border-slate-900 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSubModal(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quiz Modal: Select Question Banks + Configure Timer/Points */}
      {showQuizModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveQuiz}
            className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl max-h-[92vh] overflow-y-auto"
          >
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {editingQuiz ? 'Test to‘plamini tahrirlash' : 'Savollar bazasidan test qo‘shish'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {activeSubject?.name} fani uchun Savollar bazasidan test bazalarini tanlang
              </p>
            </div>

            {/* Question Bank Multi-Select */}
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold uppercase text-slate-600">
                  1. “Testlar” bazasidan tanlang *
                </label>
                <span className="text-xs font-semibold text-blue-700">
                  {selectedBankIds.length} ta test · {selectedTotalQuestions} ta savol
                </span>
              </div>

              {banks.length > 4 && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={bankFilter}
                    onChange={(e) => setBankFilter(e.target.value)}
                    placeholder="Baza nomi bo‘yicha qidirish..."
                    className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {banks.length === 0 ? (
                <div className="rounded-lg bg-white border border-slate-200 p-4 text-center space-y-2">
                  <div className="text-xs text-slate-600">
                    Hali Savollar bazasida test yuklanmagan.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuizModal(false);
                      onOpenBank();
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Savollar bazasiga test yuklash →
                  </button>
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-0.5">
                  {visibleModalBanks.map((bank) => {
                    const checked = selectedBankIds.includes(bank.id);
                    const qCount = getBankQuestionCount(bank.id);
                    return (
                      <div
                        key={bank.id}
                        onClick={() => toggleBankSelection(bank)}
                        className={`cursor-pointer rounded-xl border px-3 py-2.5 flex items-center justify-between gap-2 transition ${
                          checked
                            ? 'border-blue-500 bg-white shadow-sm'
                            : 'border-slate-200 bg-white/80 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {checked ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 truncate">
                              {bank.title}
                            </div>
                            {(bank.subject_name || bank.subject_hint) && (
                              <div className="text-[11px] text-slate-500 truncate">
                                {bank.subject_name || bank.subject_hint}
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md shrink-0">
                          {qCount} savol
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedTotalQuestions > 0 && (
                <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-[11px] text-violet-800 flex items-start gap-2">
                  <Shuffle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-600" />
                  <span>
                    APKda <b>{[10, 25, 50].filter((n) => selectedTotalQuestions >= n).join(' / ') || selectedTotalQuestions}</b> talik test yechilganda <b>savollar tartibi</b> ham, <b>A/B/C/D to‘g‘ri javob variantlari</b> ham har safar avtomatik chalkashtirib beriladi.
                  </span>
                </div>
              )}
            </div>

            {quizFormError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs font-medium text-red-700">
                {quizFormError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Test nomi *</label>
              <input
                type="text"
                required
                value={quizTitle}
                onChange={(e) => setQuizTitle(e.target.value)}
                placeholder="Masalan, 1-mavzu: Ko‘paytirish jadvali"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tavsif</label>
              <input
                type="text"
                value={quizDesc}
                onChange={(e) => setQuizDesc(e.target.value)}
                placeholder="10, 25 yoki 50 ta tasodifiy savollar"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Taymer (soniya/savol)
                </label>
                <input
                  type="number"
                  min={0}
                  max={300}
                  value={quizTime}
                  onChange={(e) => setQuizTime(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                />
                <span className="text-[11px] text-slate-400">0 = taymersiz</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  To‘g‘ri javob ochkosi
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={quizPoints}
                  onChange={(e) => setQuizPoints(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowQuizModal(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
