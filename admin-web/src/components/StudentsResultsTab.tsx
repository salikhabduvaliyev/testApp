import { useState } from 'react';
import { ArrowUpDown, Flame, Phone, Search, Trophy } from 'lucide-react';
import { formatUzDateTime } from '../lib/api';
import type { Student, Subject, TestAttemptRow } from '../types';

type StudentSort = 'phone_asc' | 'phone_desc' | 'points_desc' | 'name_asc' | 'recent_desc';

interface StudentsTabProps {
  students: Student[];
  attempts: TestAttemptRow[];
}

export function StudentsTab({ students, attempts }: StudentsTabProps) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<StudentSort>('phone_asc');

  const displayName = (st: Student) =>
    (st.full_name || `${st.first_name} ${st.last_name}`).trim();

  const filtered = students
    .filter((st) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const digitsQuery = q.replace(/\D/g, '');
      return (
        displayName(st).toLowerCase().includes(q) ||
        (st.phone || '').toLowerCase().includes(q) ||
        (digitsQuery.length > 0 && (st.phone || '').replace(/\D/g, '').includes(digitsQuery)) ||
        st.recovery_code.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'phone_asc':
          return (a.phone || '').localeCompare(b.phone || '');
        case 'phone_desc':
          return (b.phone || '').localeCompare(a.phone || '');
        case 'points_desc':
          return b.total_points - a.total_points;
        case 'name_asc':
          return displayName(a).localeCompare(displayName(b), 'uz');
        case 'recent_desc':
          return (b.last_active_at || '').localeCompare(a.last_active_at || '');
      }
    });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Foydalanuvchilar (O‘quvchilar)</h2>
        <p className="text-sm text-slate-500">
          Har bir foydalanuvchi o‘z telefon raqami bilan yagona ro‘yxatga olinadi va saralanadi
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="F.I.O yoki telefon raqami (+998...) bo‘yicha qidirish"
            className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-slate-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as StudentSort)}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
          >
            <option value="phone_asc">Saralash: Telefon raqam (↑)</option>
            <option value="phone_desc">Saralash: Telefon raqam (↓)</option>
            <option value="points_desc">Saralash: Ochko (yuqoridan)</option>
            <option value="name_asc">Saralash: F.I.O (A–Z)</option>
            <option value="recent_desc">Saralash: Oxirgi faollik</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                <th className="py-3 px-6 font-semibold">#</th>
                <th className="py-3 px-4 font-semibold">F.I.O</th>
                <th className="py-3 px-4 font-semibold">Telefon raqami</th>
                <th className="py-3 px-4 font-semibold">Ochko</th>
                <th className="py-3 px-4 font-semibold">Streak</th>
                <th className="py-3 px-4 font-semibold">Testlar</th>
                <th className="py-3 px-6 font-semibold">Oxirgi faollik</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    Foydalanuvchilar topilmadi.
                  </td>
                </tr>
              ) : (
                filtered.map((st, idx) => {
                  const count = attempts.filter((a) => a.student_id === st.id).length;
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-6 text-slate-500 font-medium">{idx + 1}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {displayName(st)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-800">
                          <Phone className="w-3.5 h-3.5 text-blue-600" />
                          {st.phone || '—'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 font-bold text-blue-600">
                          <Trophy className="w-3.5 h-3.5" />
                          {st.total_points.toLocaleString('uz-UZ')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                          <Flame className="w-3.5 h-3.5" />
                          {st.streak_days} kun
                        </span>
                      </td>
                      <td className="py-3.5 px-4">{count} ta</td>
                      <td className="py-3.5 px-6 text-slate-500 text-xs">
                        {formatUzDateTime(st.last_active_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface ResultsTabProps {
  attempts: TestAttemptRow[];
  subjects: Subject[];
}

export function ResultsTab({ attempts, subjects }: ResultsTabProps) {
  const [subjectFilter, setSubjectFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const filtered = attempts.filter((a) => {
    if (subjectFilter !== 'ALL' && a.subject_id !== subjectFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const studentName = (
      a.students?.full_name || `${a.students?.first_name || ''} ${a.students?.last_name || ''}`
    ).toLowerCase();
    const phone = (a.students?.phone || '').toLowerCase();
    const digitsQ = q.replace(/\D/g, '');
    return (
      studentName.includes(q) ||
      phone.includes(q) ||
      (digitsQ.length > 0 && phone.replace(/\D/g, '').includes(digitsQ)) ||
      (a.quizzes?.title || '').toLowerCase().includes(q) ||
      (a.subjects?.name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Test natijalari</h2>
        <p className="text-sm text-slate-500">
          O‘quvchilar yechgan barcha 10 / 25 / 50 talik test urinishlari tarixi
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="F.I.O, telefon raqami yoki test nomi..."
            className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
        >
          <option value="ALL">Barcha fanlar</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                <th className="py-3 px-6 font-semibold">F.I.O</th>
                <th className="py-3 px-4 font-semibold">Telefon raqami</th>
                <th className="py-3 px-4 font-semibold">Fan / Test to‘plami</th>
                <th className="py-3 px-4 font-semibold">Rejim</th>
                <th className="py-3 px-4 font-semibold">To‘g‘ri / Jami</th>
                <th className="py-3 px-4 font-semibold">Foiz</th>
                <th className="py-3 px-4 font-semibold">Vaqt (soniya)</th>
                <th className="py-3 px-6 font-semibold">Sana</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row) => {
                const pct = Math.round(Number(row.score_percent || 0));
                const fullName =
                  row.students?.full_name ||
                  (row.students ? `${row.students.first_name} ${row.students.last_name}`.trim() : '') ||
                  'Noma’lum';
                return (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-6 font-medium text-slate-900">{fullName}</td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                      {row.students?.phone || '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-800">{row.subjects?.name || '—'}</div>
                      <div className="text-xs text-slate-500">{row.quizzes?.title || '—'}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {row.requested_count} ta savol
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold">
                      {row.correct_count} / {row.total_questions}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          pct >= 80
                            ? 'bg-emerald-50 text-emerald-700'
                            : pct >= 50
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {pct}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">{row.duration_sec}s</td>
                    <td className="py-3.5 px-6 text-slate-500 text-xs">
                      {formatUzDateTime(row.completed_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
