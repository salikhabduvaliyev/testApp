import { Activity, Award, BookOpen, CheckCircle2, RefreshCw, Users } from 'lucide-react';
import { formatUzDateTime } from '../lib/api';
import type { DashboardStats, TestAttemptRow } from '../types';

interface DashboardTabProps {
  stats: DashboardStats;
  recentAttempts: TestAttemptRow[];
  isLive: boolean;
  loading: boolean;
  onRefresh: () => void;
  onGoToUpload: () => void;
}

export function DashboardTab({
  stats,
  recentAttempts,
  isLive,
  loading,
  onRefresh,
  onGoToUpload,
}: DashboardTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Boshqaruv paneli</h2>
          <p className="text-sm text-slate-500">
            O‘quvchilar APK orqali yechgan testlar va natijalar real vaqtda ko‘rinadi
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              isLive
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            {isLive ? 'Jonli (SQLite SSE)' : 'Ulanmoqda'}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Yangilash
          </button>
          <button
            type="button"
            onClick={onGoToUpload}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
          >
            + Yangi test yuklash
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Jami o‘quvchilar"
          value={stats.total_students.toLocaleString('uz-UZ')}
          subtitle="Ro‘yxatdan o‘tgan"
          icon={<Users className="w-5 h-5 text-blue-600" />}
          bg="bg-blue-50"
        />
        <KpiCard
          title="Bugun faol"
          value={stats.active_today.toLocaleString('uz-UZ')}
          subtitle="Bugun test yechganlar"
          icon={<Activity className="w-5 h-5 text-emerald-600" />}
          bg="bg-emerald-50"
        />
        <KpiCard
          title="Yechilgan testlar"
          value={stats.total_attempts.toLocaleString('uz-UZ')}
          subtitle={`${stats.total_subjects} fan · ${stats.total_banks ?? 0} test · ${stats.total_questions} savol`}
          icon={<CheckCircle2 className="w-5 h-5 text-violet-600" />}
          bg="bg-violet-50"
        />
        <KpiCard
          title="O‘rtacha natija"
          value={`${stats.avg_score_percent}%`}
          subtitle="Barcha urinishlar bo‘yicha"
          icon={<Award className="w-5 h-5 text-amber-600" />}
          bg="bg-amber-50"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-semibold text-slate-900">So‘nggi test natijalari (APKdan)</h3>
          </div>
          <span className="text-xs text-slate-500">Oxirgi {recentAttempts.length} ta urinish</span>
        </div>

        {recentAttempts.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Hali birorta test yechilmagan. O‘quvchilar APK orqali test yechganda natijalar shu yerda ko‘rinadi.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                  <th className="py-3 px-6 font-semibold">F.I.O</th>
                  <th className="py-3 px-4 font-semibold">Telefon raqami</th>
                  <th className="py-3 px-4 font-semibold">Fan / Test</th>
                  <th className="py-3 px-4 font-semibold">Natija</th>
                  <th className="py-3 px-4 font-semibold">Foiz</th>
                  <th className="py-3 px-4 font-semibold">Ochko</th>
                  <th className="py-3 px-6 font-semibold">Vaqt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentAttempts.map((row) => {
                  const fullName =
                    row.students?.full_name ||
                    (row.students ? `${row.students.first_name} ${row.students.last_name}`.trim() : '') ||
                    'Noma’lum o‘quvchi';
                  const phone = row.students?.phone || '—';
                  const pct = Math.round(Number(row.score_percent || 0));
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 px-6 font-medium text-slate-900">{fullName}</td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-700">{phone}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800">{row.subjects?.name || 'Fan'}</div>
                        <div className="text-xs text-slate-500">{row.quizzes?.title || 'Test'}</div>
                      </td>
                      <td className="py-3.5 px-4 font-medium">
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
                      <td className="py-3.5 px-4 font-semibold text-blue-600">+{row.earned_points}</td>
                      <td className="py-3.5 px-6 text-slate-500 whitespace-nowrap">
                        {formatUzDateTime(row.completed_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  bg,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start justify-between">
      <div>
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</div>
        <div className="text-3xl font-bold text-slate-900 mt-1.5">{value}</div>
        <div className="text-xs text-slate-500 mt-1">{subtitle}</div>
      </div>
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
    </div>
  );
}

