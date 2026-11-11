import { useState } from 'react';
import { Database, Lock, User } from 'lucide-react';
import { adminApi } from '../lib/api';

interface LoginViewProps {
  onLoginSuccess: (username: string) => void;
}

export function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await adminApi.login(username.trim(), password);
      onLoginSuccess(res.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kirishda xatolik yuz berdi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-slate-200 p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl font-bold shadow-sm">
            D
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">DONO Admin</h1>
            <p className="text-sm text-slate-500">Testlar va o‘quvchilar boshqaruvi</p>
          </div>
        </div>

        <div className="rounded-2xl bg-blue-50/70 border border-blue-200 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-800 uppercase tracking-wide">
            <Database className="w-4 h-4" />
            O‘z SQLite bazasi · Port 8000 · API kalitsiz
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Barcha fanlar, savollar va APK natijalari shu serverdagi o‘z bazamizda saqlanadi. Standart kirish:{' '}
            <code className="font-semibold text-slate-900">admin</code> /{' '}
            <code className="font-semibold text-slate-900">admin123</code>
          </p>
          <button
            type="button"
            onClick={() => {
              setUsername('admin');
              setPassword('admin123');
            }}
            className="text-xs font-semibold text-blue-700 hover:underline"
          >
            Standart loginni to‘ldirish
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Admin login</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                className="w-full rounded-xl border border-slate-300 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Parol</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-300 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 text-white py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition"
          >
            {loading ? 'Tekshirilmoqda...' : 'Admin panelga kirish'}
          </button>
        </form>
      </div>
    </div>
  );
}
