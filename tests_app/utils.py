import base64
import hashlib
import hmac
import json
import re
import secrets
from django.conf import settings
from django.utils import timezone


def normalize_phone(raw: str | None) -> str | None:
    if not raw:
        return None
    s = str(raw).strip()
    digits = re.sub(r'\D', '', s)
    if not digits:
        return None
    if len(digits) == 9:
        return f'+998{digits}'
    if digits.startswith('998'):
        return f'+{digits}' if len(digits) == 12 else None
    if s.startswith('+') and 10 <= len(digits) <= 15:
        return f'+{digits}'
    if 10 <= len(digits) <= 15:
        return f'+{digits}'
    return None


def format_uz_phone(phone: str | None) -> str:
    if not phone:
        return '—'
    p = str(phone).strip()
    digits = re.sub(r'\D', '', p)
    if len(digits) == 12 and digits.startswith('998'):
        d = digits[3:]
        return f'+998 {d[0:2]} {d[2:5]} {d[5:7]} {d[7:9]}'
    return p


def normalize_full_name(raw: str | None) -> str:
    return re.sub(r'\s+', ' ', str(raw or '').strip())


def tokenize_name(name: str) -> list[str]:
    clean = normalize_full_name(name).lower()
    clean = re.sub(r'[’ʻ‘`´]', "'", clean)
    clean = re.sub(r"[^a-zа-яё0-9'\s]", ' ', clean)
    return [t for t in clean.split() if t and t != "'"]


def names_belong_to_same_person(existing: str, incoming: str) -> bool:
    a = re.sub(r'[’ʻ‘`´]', "'", normalize_full_name(existing).lower())
    b = re.sub(r'[’ʻ‘`´]', "'", normalize_full_name(incoming).lower())
    if not a or not b:
        return False
    if a == b:
        return True
    a_tokens = set(tokenize_name(existing))
    b_tokens = set(tokenize_name(incoming))
    if not a_tokens or not b_tokens:
        return False
    smaller = a_tokens if len(a_tokens) <= len(b_tokens) else b_tokens
    larger = b_tokens if len(a_tokens) <= len(b_tokens) else a_tokens
    overlap = sum(1 for t in smaller if t in larger)
    return overlap == len(smaller)


def split_full_name(full_name: str) -> tuple[str, str]:
    clean = normalize_full_name(full_name)
    parts = clean.split(' ')
    if len(parts) <= 1:
        return parts[0] if parts else '', ''
    return parts[0], ' '.join(parts[1:])


def compute_level_name(points: int) -> str:
    if points >= 2500:
        return 'Ustoz'
    if points >= 1500:
        return 'Alloma'
    if points >= 800:
        return 'Zukko'
    if points >= 300:
        return 'Bilimdon'
    return 'Boshlovchi'


def generate_recovery_code() -> str:
    return secrets.token_hex(4).upper()


def _get_signing_secret() -> bytes:
    return getattr(settings, 'SECRET_KEY', 'dono-secret').encode('utf-8')


def sign_shuffled_answer(qid: str, correct_letter: str) -> str:
    payload_dict = {'qid': str(qid), 'correct': str(correct_letter).upper()}
    raw_json = json.dumps(payload_dict, separators=(',', ':')).encode('utf-8')
    payload = base64.urlsafe_b64encode(raw_json).decode('utf-8').rstrip('=')
    sig = hmac.new(_get_signing_secret(), payload.encode('utf-8'), hashlib.sha256).hexdigest()
    return f'{payload}.{sig}'


def verify_shuffled_answer(token: str | None, expected_qid: str) -> str | None:
    if not token or '.' not in str(token):
        return None
    try:
        parts = str(token).split('.')
        if len(parts) != 2:
            return None
        payload, sig = parts
        expected_sig = hmac.new(_get_signing_secret(), payload.encode('utf-8'), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None
        # Add back padding
        pad = len(payload) % 4
        padded = payload + ('=' * ((4 - pad) % 4))
        raw_json = base64.urlsafe_b64decode(padded.encode('utf-8')).decode('utf-8')
        data = json.loads(raw_json)
        if data.get('qid') != str(expected_qid):
            return None
        correct = str(data.get('correct', '')).upper()
        return correct if correct in ('A', 'B', 'C', 'D') else None
    except Exception:
        return None


def format_uz_datetime(dt) -> str:
    if not dt:
        return '—'
    try:
        local_dt = timezone.localtime(dt)
        return local_dt.strftime('%d.%m.%Y %H:%M')
    except Exception:
        return str(dt)[:16]
