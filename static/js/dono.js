function getCookie(name) {
  const cookies = document.cookie ? document.cookie.split(';') : [];
  for (const c of cookies) {
    const trimmed = c.trim();
    if (trimmed.startsWith(name + '=')) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return '';
}

function getCsrfToken() {
  return getCookie('csrftoken') || document.querySelector('meta[name="csrf-token"]')?.content || '';
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

document.addEventListener('click', (e) => {
  if (e.target.classList?.contains('modal-backdrop')) {
    e.target.classList.remove('open');
  }
});

// Lightweight PythonAnywhere-safe auto-refresh via /api/admin/heartbeat
(function setupHeartbeatPoll() {
  const meta = document.getElementById('dono-heartbeat-config');
  if (!meta) return;
  let lastVersion = meta.dataset.version || '';
  const enabled = meta.dataset.autopoll === '1';
  if (!enabled) return;

  setInterval(async () => {
    if (document.querySelector('.modal-backdrop.open')) return;
    if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    try {
      const res = await fetch('/api/admin/heartbeat', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.version && lastVersion && data.version !== lastVersion) {
        window.location.reload();
      }
      if (data.version) lastVersion = data.version;
    } catch {
      // ignore transient network errors
    }
  }, 5000);
})();
