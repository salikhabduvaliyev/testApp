import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Pencil,
  Plus,
  Search,
  Shuffle,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { adminApi } from '../lib/api';
import { downloadSampleTemplate, parseQuestionFile } from '../lib/questionParser';
import type {
  CorrectOption,
  ParsedQuestionInput,
  Question,
  QuestionBank,
  Quiz,
  Subject,
} from '../types';

interface QuestionsTabProps {
  subjects: Subject[];
  banks: QuestionBank[];
  quizzes: Quiz[];
  questions: Question[];
  initialBankId?: string;
  initialOpenUpload?: boolean;
  onConsumeIntent?: () => void;
  onCreateBank: (payload: {
    title: string;
    description?: string;
    subject_id?: string | null;
    subject_hint?: string;
    source_type?: string;
    auto_create_quiz?: boolean;
    time_per_question_sec?: number;
    points_per_correct?: number;
    questions?: ParsedQuestionInput[];
  }) => Promise<{ id: string; quiz_id?: string | null; inserted: number } | undefined>;
  onUpdateBank: (id: string, payload: Partial<QuestionBank>) => Promise<void>;
  onDeleteBank: (id: string) => Promise<void>;
  onAddQuestions: (bankId: string, rows: ParsedQuestionInput[]) => Promise<void>;
  onUpdateQuestion: (id: string, payload: Partial<Question>) => Promise<void>;
  onDeleteQuestion: (id: string) => Promise<void>;
}

const SOURCE_LABELS: Record<string, string> = {
  docx: 'Word (.docx)',
  doc: 'Word (.doc)',
  pdf: 'PDF (.pdf)',
  txt: 'Matn (.txt)',
  xlsx: 'Excel (.xlsx)',
  xls: 'Excel (.xls)',
  csv: 'CSV',
  json: 'JSON',
  seeded: 'Tayyor baza',
};

export function QuestionsTab({
  subjects,
  banks,
  quizzes,
  questions,
  initialBankId,
  initialOpenUpload,
  onConsumeIntent,
  onCreateBank,
  onUpdateBank,
  onDeleteBank,
  onAddQuestions,
  onUpdateQuestion,
  onDeleteQuestion,
}: QuestionsTabProps) {
  const [viewingBankId, setViewingBankId] = useState<string | null>(initialBankId || null);
  const [listSearch, setListSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('ALL');
  const [qSearch, setQSearch] = useState('');

  // New Test Upload Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadSubjectId, setUploadSubjectId] = useState<string>(subjects[0]?.id || '');
  const [autoCreateQuiz, setAutoCreateQuiz] = useState(true);
  const [timerSec, setTimerSec] = useState(20);
  const [pointsPerCorrect, setPointsPerCorrect] = useState(5);
  const [dragging, setDragging] = useState(false);
  const [parsingFile, setParsingFile] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileExt, setFileExt] = useState('');
  const [parsedValid, setParsedValid] = useState<ParsedQuestionInput[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [savingUpload, setSavingUpload] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  // Edit Test metadata modal
  const [editingBank, setEditingBank] = useState<QuestionBank | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSubjectId, setEditSubjectId] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Single question edit modal (inside detail view)
  const [editingQ, setEditingQ] = useState<Question | null>(null);
  const [qText, setQText] = useState('');
  const [qExpr, setQExpr] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [correctOpt, setCorrectOpt] = useState<CorrectOption>('A');
  const [explanation, setExplanation] = useState('');
  const [savingQ, setSavingQ] = useState(false);

  // Append extra file modal inside detail view
  const [appendParsing, setAppendParsing] = useState(false);

  useEffect(() => {
    if (initialBankId) {
      setViewingBankId(initialBankId);
      onConsumeIntent?.();
    }
  }, [initialBankId, onConsumeIntent]);

  useEffect(() => {
    if (initialOpenUpload) {
      openUploadModal();
      onConsumeIntent?.();
    }
  }, [initialOpenUpload]);

  useEffect(() => {
    if (viewingBankId && !banks.some((b) => b.id === viewingBankId)) {
      setViewingBankId(null);
    }
  }, [banks, viewingBankId]);

  const resolveSubjectName = (bank: QuestionBank) => {
    if (bank.subject_name) return bank.subject_name;
    if (bank.subject_id) {
      const sub = subjects.find((s) => s.id === bank.subject_id);
      if (sub) return sub.name;
    }
    return bank.subject_hint || '';
  };

  const resolveSubjectColor = (bank: QuestionBank) => {
    if (bank.subject_id) {
      return subjects.find((s) => s.id === bank.subject_id)?.color_hex || '#2563EB';
    }
    const name = (bank.subject_hint || '').toLowerCase();
    return subjects.find((s) => s.name.toLowerCase() === name)?.color_hex || '#64748B';
  };

  const resetUploadForm = () => {
    setUploadTitle('');
    setUploadSubjectId(subjects[0]?.id || '');
    setAutoCreateQuiz(true);
    setTimerSec(20);
    setPointsPerCorrect(5);
    setFileName('');
    setFileExt('');
    setParsedValid([]);
    setParseErrors([]);
    setParsingFile(false);
  };

  const openUploadModal = () => {
    resetUploadForm();
    setShowUploadModal(true);
  };

  const parseUploadedFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    setFileName(file.name);
    setFileExt(ext);
    setParseErrors([]);
    setParsedValid([]);
    setParsingFile(true);

    if (!uploadTitle.trim()) {
      const autoTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      if (autoTitle) setUploadTitle(autoTitle);
    }

    try {
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv' || ext === 'json') {
        const res = await parseQuestionFile(file);
        setParsedValid(res.valid);
        setParseErrors(res.errors);
      } else {
        const res = await adminApi.parseTestFile(file);
        setParsedValid(res.valid);
        setParseErrors(res.errors);
      }
    } catch (err) {
      setParseErrors([err instanceof Error ? err.message : 'Faylni tahlil qilishda xatolik']);
    } finally {
      setParsingFile(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTitle.trim() || parsedValid.length === 0) return;
    setSavingUpload(true);
    try {
      const subObj = subjects.find((s) => s.id === uploadSubjectId) || null;
      const res = await onCreateBank({
        title: uploadTitle.trim(),
        description: `${fileName} (${parsedValid.length} ta savol)`,
        subject_id: subObj?.id || null,
        subject_hint: subObj?.name || '',
        source_type: fileExt || 'docx',
        auto_create_quiz: Boolean(subObj && autoCreateQuiz),
        time_per_question_sec: timerSec,
        points_per_correct: pointsPerCorrect,
        questions: parsedValid,
      });
      setShowUploadModal(false);
      setBannerMsg(
        res?.quiz_id
          ? `"${uploadTitle.trim()}" (${parsedValid.length} ta savol) yuklandi va "${subObj?.name}" faniga ulandi!`
          : `"${uploadTitle.trim()}" (${parsedValid.length} ta savol) Testlar ro‘yxatiga saqlandi!`
      );
      resetUploadForm();
    } finally {
      setSavingUpload(false);
    }
  };

  const handleAppendFileToBank = async (bankId: string, file: File) => {
    setAppendParsing(true);
    setBannerMsg(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const res =
        ext === 'xlsx' || ext === 'xls' || ext === 'csv' || ext === 'json'
          ? await parseQuestionFile(file)
          : await adminApi.parseTestFile(file);

      if (res.valid.length === 0) {
        alert(res.errors[0] || 'Faylda to‘g‘ri formatdagi savollar topilmadi.');
        return;
      }
      await onAddQuestions(bankId, res.valid);
      setBannerMsg(`${res.valid.length} ta yangi savol qo‘shildi!`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fayl yuklashda xatolik');
    } finally {
      setAppendParsing(false);
    }
  };

  const openEditBank = (bank: QuestionBank) => {
    setEditingBank(bank);
    setEditTitle(bank.title);
    setEditSubjectId(bank.subject_id || '');
    setEditDesc(bank.description || '');
  };

  const handleSaveBankEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBank || !editTitle.trim()) return;
    setSavingEdit(true);
    try {
      await onUpdateBank(editingBank.id, {
        title: editTitle.trim(),
        subject_id: editSubjectId || null,
        description: editDesc.trim(),
      });
      setEditingBank(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const openEditQuestion = (q: Question) => {
    setEditingQ(q);
    setQText(q.question_text);
    setQExpr(q.expression_text || '');
    setOptA(q.option_a);
    setOptB(q.option_b);
    setOptC(q.option_c);
    setOptD(q.option_d);
    setCorrectOpt(q.correct_option);
    setExplanation(q.explanation || '');
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQ) return;
    setSavingQ(true);
    try {
      await onUpdateQuestion(editingQ.id, {
        question_text: qText.trim(),
        expression_text: qExpr.trim() || null,
        option_a: optA.trim(),
        option_b: optB.trim(),
        option_c: optC.trim(),
        option_d: optD.trim(),
        correct_option: correctOpt,
        explanation: explanation.trim(),
      });
      setEditingQ(null);
    } finally {
      setSavingQ(false);
    }
  };

  const filteredBanks = banks.filter((b) => {
    if (subjectFilter !== 'ALL') {
      if (subjectFilter === 'NONE' && (b.subject_id || resolveSubjectName(b))) return false;
      if (subjectFilter !== 'NONE' && b.subject_id !== subjectFilter) return false;
    }
    const q = listSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      b.title.toLowerCase().includes(q) ||
      resolveSubjectName(b).toLowerCase().includes(q) ||
      (b.description || '').toLowerCase().includes(q)
    );
  });

  const viewingBank = viewingBankId ? banks.find((b) => b.id === viewingBankId) || null : null;
  const viewingQuestions = viewingBank
    ? questions.filter((q) => {
        if (q.bank_id !== viewingBank.id) return false;
        const s = qSearch.trim().toLowerCase();
        if (!s) return true;
        return (
          q.question_text.toLowerCase().includes(s) ||
          (q.expression_text || '').toLowerCase().includes(s) ||
          q.option_a.toLowerCase().includes(s) ||
          q.option_b.toLowerCase().includes(s) ||
          q.option_c.toLowerCase().includes(s) ||
          q.option_d.toLowerCase().includes(s)
        );
      })
    : [];

  // ── DETAIL VIEW: QUESTIONS INSIDE A SELECTED TEST ─────────────────────
  if (viewingBank) {
    const subName = resolveSubjectName(viewingBank);
    const totalCount = questions.filter((q) => q.bank_id === viewingBank.id).length;
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setViewingBankId(null);
                setQSearch('');
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Testlar ro‘yxati
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">{viewingBank.title}</h2>
                {subName && (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: resolveSubjectColor(viewingBank) }}
                  >
                    {subName}
                  </span>
                )}
                <span className="rounded-full bg-blue-50 text-blue-700 px-2.5 py-0.5 text-xs font-semibold">
                  {totalCount} ta savol
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                APKda savollar tartibi va A/B/C/D variantlar har safar avtomatik chalkashtirib beriladi
              </p>
            </div>
          </div>

          <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
            <Plus className="w-4 h-4" />
            {appendParsing ? 'Yuklanmoqda...' : 'Fayldan savol qo‘shish'}
            <input
              type="file"
              accept=".docx,.doc,.pdf,.txt,.xlsx,.xls,.csv,.json"
              disabled={appendParsing}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleAppendFileToBank(viewingBank.id, f);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {bannerMsg && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              {bannerMsg}
            </div>
            <button type="button" onClick={() => setBannerMsg(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-800">
              Savollar ({viewingQuestions.length})
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={qSearch}
                onChange={(e) => setQSearch(e.target.value)}
                placeholder="Savol qidirish..."
                className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {viewingQuestions.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Savollar topilmadi.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {viewingQuestions.map((q, idx) => (
                <div key={q.id} className="p-5 flex items-start justify-between gap-4 hover:bg-slate-50/70">
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                      <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                        #{idx + 1}
                      </span>
                      <span>{q.question_text}</span>
                      {q.expression_text && (
                        <span className="px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-mono text-xs">
                          {q.expression_text}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                      {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                        const val =
                          opt === 'A'
                            ? q.option_a
                            : opt === 'B'
                            ? q.option_b
                            : opt === 'C'
                            ? q.option_c
                            : q.option_d;
                        const isCorrect = q.correct_option === opt;
                        return (
                          <div
                            key={opt}
                            className={`rounded-lg px-2.5 py-1.5 border ${
                              isCorrect
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold'
                                : 'border-slate-200 bg-white text-slate-600'
                            }`}
                          >
                            {isCorrect ? '#' : ''}
                            {opt.toLowerCase()}) {val}
                          </div>
                        );
                      })}
                    </div>
                    {q.explanation && (
                      <div className="text-xs text-slate-500">Izoh: {q.explanation}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditQuestion(q)}
                      className="p-2 rounded-lg text-slate-500 hover:bg-white hover:text-blue-600"
                      title="Tahrirlash"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Bu savolni o‘chirasizmi?')) void onDeleteQuestion(q.id);
                      }}
                      className="p-2 rounded-lg text-slate-500 hover:bg-white hover:text-red-600"
                      title="O‘chirish"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Single Question Edit Modal */}
        {editingQ && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <form
              onSubmit={handleSaveQuestion}
              className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-lg font-bold text-slate-900">Savolni tahrirlash</h3>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Savol matni *</label>
                <input
                  type="text"
                  required
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Ifoda / misol (ixtiyoriy)
                </label>
                <input
                  type="text"
                  value={qExpr}
                  onChange={(e) => setQExpr(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">A variant *</label>
                  <input
                    type="text"
                    required
                    value={optA}
                    onChange={(e) => setOptA(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">B variant *</label>
                  <input
                    type="text"
                    required
                    value={optB}
                    onChange={(e) => setOptB(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">C variant *</label>
                  <input
                    type="text"
                    required
                    value={optC}
                    onChange={(e) => setOptC(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">D variant *</label>
                  <input
                    type="text"
                    required
                    value={optD}
                    onChange={(e) => setOptD(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">To‘g‘ri javob *</label>
                  <select
                    value={correctOpt}
                    onChange={(e) => setCorrectOpt(e.target.value as CorrectOption)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Izoh</label>
                  <input
                    type="text"
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingQ(null)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={savingQ}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {savingQ ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // ── MAIN VIEW: CLEAN NUMBERED LIST OF UPLOADED TESTS ──────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Testlar</h2>
          <p className="text-sm text-slate-500">
            Word (.docx) yoki PDF (.pdf) fayllardan yuklangan testlar — APKda savollar va javoblar avtomatik chalkashadi
          </p>
        </div>
        <button
          type="button"
          onClick={openUploadModal}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          Yangi test yuklash
        </button>
      </div>

      {bannerMsg && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            {bannerMsg}
          </div>
          <button type="button" onClick={() => setBannerMsg(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Subject Filter */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder="Test nomi yoki fan bo‘yicha qidirish..."
            className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
        >
          <option value="ALL">Barcha fanlar ({banks.length})</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="NONE">Fan biriktirilmagan</option>
        </select>
      </div>

      {/* Numbered Tests Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {filteredBanks.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <FileText className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="text-sm font-medium text-slate-600">
              {banks.length === 0
                ? 'Hali test yuklanmagan. “+ Yangi test yuklash” tugmasini bosing.'
                : 'Qidiruv bo‘yicha test topilmadi.'}
            </div>
            {banks.length === 0 && (
              <button
                type="button"
                onClick={openUploadModal}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Yangi test yuklash
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredBanks.map((bank, idx) => {
              const qCount = questions.filter((q) => q.bank_id === bank.id).length;
              const subName = resolveSubjectName(bank);
              const subColor = resolveSubjectColor(bank);
              const linkedQuizzes = quizzes.filter((qz) => (qz.bank_ids || []).includes(bank.id)).length;
              const sourceLabel = bank.source_type ? SOURCE_LABELS[bank.source_type] || bank.source_type.toUpperCase() : '';

              return (
                <div
                  key={bank.id}
                  onClick={() => setViewingBankId(bank.id)}
                  className="cursor-pointer px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 transition"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate flex items-center gap-2">
                        <span>{idx + 1}. {bank.title}</span>
                        {sourceLabel && (
                          <span className="text-[11px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                            {sourceLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                        {subName ? (
                          <span
                            className="inline-flex items-center gap-1.5 font-semibold px-2.5 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: subColor }}
                          >
                            {subName}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 px-2.5 py-0.5 font-medium">
                            Fan biriktirilmagan
                          </span>
                        )}
                        <span className="rounded-md bg-blue-50 text-blue-700 px-2 py-0.5 font-semibold">
                          {qCount} ta savol
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 text-violet-700 px-2 py-0.5 font-medium">
                          <Shuffle className="w-3 h-3" />
                          Avto-chalkash
                        </span>
                        {linkedQuizzes > 0 && (
                          <span className="rounded-md bg-emerald-50 text-emerald-700 px-2 py-0.5 font-medium">
                            APKda faol ({linkedQuizzes})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-1.5 shrink-0 pl-11 sm:pl-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setViewingBankId(bank.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 px-3 py-1.5 text-xs font-semibold transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Savollar ({qCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditBank(bank)}
                      className="p-2 rounded-lg text-slate-400 hover:bg-white hover:text-blue-600"
                      title="Nomi / Fanni tahrirlash"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const warn =
                          linkedQuizzes > 0
                            ? `Bu test hozir ${linkedQuizzes} ta test to‘plamida ishlatilmoqda.\n`
                            : '';
                        if (
                          confirm(
                            `${warn}"${bank.title}" testini va undagi ${qCount} ta savolni o‘chirasizmi?`
                          )
                        ) {
                          void onDeleteBank(bank.id);
                        }
                      }}
                      className="p-2 rounded-lg text-slate-400 hover:bg-white hover:text-red-600"
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

      {/* ── UPLOAD NEW TEST MODAL (Word / PDF / #a) format) ─────────────── */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleUploadSubmit}
            className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Yangi test yuklash</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Test nomi va fanni tanlab Word (.docx) yoki PDF (.pdf) fayl yuklang
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Test nomi *</label>
                <input
                  type="text"
                  required
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Masalan: Ona tili yangi"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fanni tanlang</label>
                <select
                  value={uploadSubjectId}
                  onChange={(e) => setUploadSubjectId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="">Keyinroq biriktirish (faqat bazaga)</option>
                </select>
              </div>
            </div>

            {/* File dropzone */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium text-slate-700">
                  Test fayli (Word .docx, PDF .pdf) *
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Namuna:</span>
                  <a
                    href="/api/admin/sample-test?format=docx"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 font-medium text-blue-700 hover:bg-blue-50"
                  >
                    <Download className="w-3 h-3" />
                    Word (.docx)
                  </a>
                  <a
                    href="/api/admin/sample-test?format=txt"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Download className="w-3 h-3" />
                    .txt
                  </a>
                  <button
                    type="button"
                    onClick={() => downloadSampleTemplate('xlsx')}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Download className="w-3 h-3" />
                    .xlsx
                  </button>
                </div>
              </div>

              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void parseUploadedFile(f);
                }}
                className={`block cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition ${
                  dragging
                    ? 'border-blue-500 bg-blue-50/70'
                    : 'border-slate-300 hover:border-blue-400 bg-slate-50/60'
                }`}
              >
                <input
                  type="file"
                  accept=".docx,.doc,.pdf,.txt,.xlsx,.xls,.csv,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void parseUploadedFile(f);
                    e.target.value = '';
                  }}
                />
                <UploadCloud className="w-8 h-8 text-blue-600 mx-auto mb-1.5" />
                <div className="text-sm font-semibold text-slate-800">
                  {parsingFile
                    ? 'Fayl o‘qilmoqda...'
                    : fileName
                    ? `Tanlangan fayl: ${fileName}`
                    : 'Word (.docx) yoki PDF (.pdf) faylni shu yerga tashlang yoki tanlang'}
                </div>
                <div className="mt-2 inline-block text-left rounded-xl bg-white border border-slate-200 px-3.5 py-2 font-mono text-[11px] text-slate-600 leading-relaxed">
                  1. Savol matni?<br />
                  <span className="text-emerald-700 font-bold">#a) To‘g‘ri variant</span><br />
                  b) Ikkinchi variant<br />
                  c) Uchinchi variant<br />
                  d) To‘rtinchi variant
                </div>
              </label>
            </div>

            {parseErrors.length > 0 && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 space-y-1 text-xs text-red-700">
                <div className="font-semibold flex items-center gap-1.5 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {parseErrors.length} ta muammo topildi:
                </div>
                {parseErrors.slice(0, 6).map((err, i) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            )}

            {parsedValid.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    {parsedValid.length} ta savol tayyor! APKda savollar va variantlar chalkashadi.
                  </span>
                </div>
                <div className="max-h-36 overflow-auto rounded-lg border border-emerald-200/80 bg-white divide-y text-xs">
                  {parsedValid.slice(0, 8).map((row, idx) => (
                    <div key={idx} className="p-2 flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-slate-800">
                        {idx + 1}. {row.question_text}
                      </span>
                      <span className="shrink-0 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        #{row.correct_option.toLowerCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attach directly to Subject in APK */}
            {uploadSubjectId && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoCreateQuiz}
                    onChange={(e) => setAutoCreateQuiz(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Tanlangan fanga APK uchun test to‘plami ham yaratilsin (darhol yechishga chiqadi)
                </label>
                {autoCreateQuiz && (
                  <div className="grid grid-cols-2 gap-3 pl-5">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        Taymer (soniya/savol)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={300}
                        value={timerSec}
                        onChange={(e) => setTimerSec(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        To‘g‘ri javob ochkosi
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={pointsPerCorrect}
                        onChange={(e) => setPointsPerCorrect(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={savingUpload || parsingFile || parsedValid.length === 0 || !uploadTitle.trim()}
                className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savingUpload
                  ? 'Saqlanmoqda...'
                  : parsedValid.length > 0
                  ? `Yuklash va saqlash (${parsedValid.length} ta)`
                  : 'Yuklash va saqlash'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── EDIT BANK METADATA MODAL ───────────────────────────────────── */}
      {editingBank && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveBankEdit}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-lg font-bold text-slate-900">Testni tahrirlash</h3>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Test nomi *</label>
              <input
                type="text"
                required
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fanni biriktirish</label>
              <select
                value={editSubjectId}
                onChange={(e) => setEditSubjectId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm"
              >
                <option value="">Fan biriktirilmagan</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Izoh (ixtiyoriy)</label>
              <input
                type="text"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingBank(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {savingEdit ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
