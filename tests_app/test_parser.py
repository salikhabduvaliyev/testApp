import csv
import io
import json
import re
from docx import Document
from openpyxl import Workbook, load_workbook
from pypdf import PdfReader

OPTION_LETTER_MAP = {
    'a': 'A',
    'b': 'B',
    'c': 'C',
    'd': 'D',
    '\u0430': 'A',  # Cyrillic а
    '\u0431': 'B',  # Cyrillic б
    '\u0432': 'C',  # Cyrillic в
    '\u0433': 'D',  # Cyrillic г
    '\u0441': 'C',  # Cyrillic с (homoglyph)
}


def map_option_letter(ch: str | None) -> str | None:
    if not ch:
        return None
    return OPTION_LETTER_MAP.get(ch.lower())


Q_NUM_PREFIX_RE = re.compile(r'^(?:(?:№\s*)?\d+\s*[).:-]|Savol\s*\d+\s*[).:-]?)\s+', re.IGNORECASE)
INLINE_OPT_SPLIT_RE = re.compile(
    r'(?<=\S)(?:\s+(?=(?:[*+#]\s*)?(?:[A-Da-d\u0430\u0410\u0431\u0411\u0432\u0412\u0433\u0413\u0441\u0421][)]|\([A-Da-d]\))(?:\s|\S))|\s{2,}(?=(?:[*+#]\s*)?[A-Da-d]\.\s))'
)
OPTION_LINE_RE = re.compile(
    r'^\s*(?P<mark>[#*+])?\s*(?:\((?P<pLet>[A-Da-d\u0430\u0410\u0431\u0411\u0432\u0412\u0433\u0413\u0441\u0421])\)|(?P<let>[A-Da-d\u0430\u0410\u0431\u0411\u0432\u0412\u0433\u0413\u0441\u0421])\s*(?P<sep>[).]))\s*(?P<body>.*)$'
)
EXPLANATION_RE = re.compile(r'^(?:Izoh|Tushuntirish|Explanation)\s*[:.-]\s*(.+)$', re.IGNORECASE)
ANSWER_HINT_RE = re.compile(
    r"^(?:To[‘'ʻ`]?g[‘'ʻ`]?ri\s+javob|Javob|Answer)\s*[:.-]\s*([A-Da-d\u0430\u0410\u0431\u0411\u0432\u0412\u0433\u0413\u0441\u0421])\b",
    re.IGNORECASE,
)
Q1_START_RE = re.compile(r'^(?:1[.)]|№\s*1\b|Savol\s*1\b)', re.IGNORECASE)

SAMPLE_TEST_LINES = [
    '1. O‘zbekiston Respublikasining poytaxti qaysi shahar?',
    '#a) Toshkent',
    'b) Samarqand',
    'c) Buxoro',
    'd) Xiva',
    '',
    '2. Ifodaning qiymati nechaga teng: 7 × 8',
    'a) 54',
    '#b) 56',
    'c) 64',
    'd) 58',
    '',
    '3. Tenglamani yeching: 2x + 6 = 18',
    'a) 4',
    'b) 5',
    '#c) 6',
    'd) 7',
]


def _normalize_text(raw: str) -> str:
    s = str(raw or '').replace('\r\n', '\n').replace('\r', '\n')
    s = re.sub(r'[\u00A0\u2007\u202F\t]+', ' ', s)
    s = re.sub(r'[\u200B\uFEFF]', '', s)
    return s


def _split_inline_options(line: str) -> list[str]:
    replaced = INLINE_OPT_SPLIT_RE.sub('\n', line)
    return [part.strip() for part in replaced.split('\n') if part.strip()]


def _parse_option_match(line: str) -> dict | None:
    m = OPTION_LINE_RE.match(line)
    if not m:
        return None
    raw_letter = m.group('pLet') or m.group('let')
    letter = map_option_letter(raw_letter)
    if not letter:
        return None
    body = (m.group('body') or '').strip()
    is_marked = bool(m.group('mark'))
    if not is_marked and re.match(r'^[#*+]\s*', body):
        is_marked = True
        body = re.sub(r'^[#*+]\s*', '', body).strip()
    return {
        'letter': letter,
        'isMarked': is_marked,
        'text': body,
        'sep': '()' if m.group('pLet') else m.group('sep'),
        'rawLine': line,
    }


def parse_formatted_test_text(raw_text: str) -> dict:
    normalized = _normalize_text(raw_text)
    lines: list[str] = []
    for rl in normalized.split('\n'):
        trimmed = rl.strip()
        if not trimmed:
            lines.append('')
        else:
            lines.extend(_split_inline_options(trimmed))

    valid: list[dict] = []
    errors: list[str] = []

    question_lines: list[str] = []
    options: dict[str, str] = {}
    current_opt_letter: str | None = None
    option_style: str | None = None
    marked_correct: str | None = None
    explanation_lines: list[str] = []
    pending_after_d: list[str] = []
    saw_blank_after_d = False

    def has_all_four() -> bool:
        return all(bool(options.get(k)) for k in ('A', 'B', 'C', 'D'))

    def has_any_options() -> bool:
        return len(options) > 0

    def finalize_question():
        nonlocal question_lines, options, current_opt_letter, option_style, marked_correct, explanation_lines, pending_after_d, saw_blank_after_d
        if not has_any_options() and not question_lines:
            return
        q_num = len(valid) + len(errors) + 1
        joined_q = re.sub(r'\s+', ' ', Q_NUM_PREFIX_RE.sub('', ' '.join(question_lines))).strip()

        if not joined_q:
            errors.append(f'{q_num}-savol: Savol matni topilmadi.')
        elif not has_all_four():
            missing = ', '.join(l for l in ('A', 'B', 'C', 'D') if not options.get(l))
            errors.append(f'{q_num}-savol ("{joined_q[:45]}..."): {missing} variant(lar)i yetishmayapti.')
        elif not marked_correct:
            errors.append(
                f'{q_num}-savol ("{joined_q[:45]}..."): To‘g‘ri javob (# belgisi bilan, masalan #a)) ko‘rsatilmagan.'
            )
        else:
            valid.append({
                'question_text': joined_q,
                'expression_text': None,
                'option_a': options['A'].strip(),
                'option_b': options['B'].strip(),
                'option_c': options['C'].strip(),
                'option_d': options['D'].strip(),
                'correct_option': marked_correct,
                'explanation': ' '.join(explanation_lines).strip(),
            })

        question_lines = []
        options = {}
        current_opt_letter = None
        option_style = None
        marked_correct = None
        explanation_lines = []
        pending_after_d = []
        saw_blank_after_d = False

    for line in lines:
        if line == '':
            if has_all_four() and pending_after_d:
                before_blank = []
                for pl in pending_after_d:
                    em = EXPLANATION_RE.match(pl)
                    am = ANSWER_HINT_RE.match(pl)
                    if em:
                        explanation_lines.append(em.group(1).strip())
                    elif am and not marked_correct:
                        marked_correct = map_option_letter(am.group(1))
                    else:
                        before_blank.append(pl)
                if before_blank and options.get('D'):
                    options['D'] = f"{options['D']} {' '.join(before_blank)}".strip()
                pending_after_d = []
                saw_blank_after_d = True
                finalize_question()
            elif has_all_four():
                saw_blank_after_d = True
            continue

        exp_match = EXPLANATION_RE.match(line)
        if exp_match and has_any_options():
            explanation_lines.append(exp_match.group(1).strip())
            continue
        ans_hint = ANSWER_HINT_RE.match(line)
        if ans_hint and has_any_options():
            if not marked_correct:
                marked_correct = map_option_letter(ans_hint.group(1))
            continue

        opt_match = _parse_option_match(line)

        if (
            opt_match
            and opt_match['letter'] == 'A'
            and options.get('A')
            and not options.get('B')
            and option_style == '.'
            and opt_match['sep'] == ')'
        ):
            question_lines.append(f"A. {options['A']}".strip())
            options = {}
            marked_correct = None
            current_opt_letter = None
            option_style = None

        if has_all_four():
            starts_numbered_q = bool(Q_NUM_PREFIX_RE.match(line)) and (not opt_match or opt_match['letter'] != 'A')
            if starts_numbered_q:
                wrapped_d = []
                for pl in pending_after_d:
                    em = EXPLANATION_RE.match(pl)
                    am = ANSWER_HINT_RE.match(pl)
                    if em:
                        explanation_lines.append(em.group(1).strip())
                    elif am and not marked_correct:
                        marked_correct = map_option_letter(am.group(1))
                    else:
                        wrapped_d.append(pl)
                if wrapped_d:
                    options['D'] = f"{options['D']} {' '.join(wrapped_d)}".strip()
                pending_after_d = []
                finalize_question()
                question_lines.append(line)
                continue

            if opt_match and opt_match['letter'] == 'A':
                next_q = list(pending_after_d)
                pending_after_d = []
                finalize_question()
                question_lines = next_q
                options['A'] = opt_match['text']
                current_opt_letter = 'A'
                option_style = opt_match['sep']
                if opt_match['isMarked']:
                    marked_correct = 'A'
                continue

            if saw_blank_after_d:
                finalize_question()
                question_lines.append(line)
            else:
                pending_after_d.append(line)
            continue

        if opt_match:
            letter = opt_match['letter']
            if letter == 'A' and options.get('A') and any(options.get(k) for k in ('B', 'C', 'D')):
                finalize_question()
            if not options.get(letter):
                options[letter] = opt_match['text']
                current_opt_letter = letter
                option_style = option_style or opt_match['sep']
                if opt_match['isMarked'] and not marked_correct:
                    marked_correct = letter
                continue

        if has_any_options() and current_opt_letter:
            options[current_opt_letter] = f"{options[current_opt_letter]} {line}".strip()
        else:
            if (
                not valid
                and not errors
                and not has_any_options()
                and question_lines
                and Q1_START_RE.match(line)
            ):
                question_lines = [line]
            else:
                question_lines.append(line)

    if has_all_four() and pending_after_d:
        tail = []
        for pl in pending_after_d:
            em = EXPLANATION_RE.match(pl)
            am = ANSWER_HINT_RE.match(pl)
            if em:
                explanation_lines.append(em.group(1).strip())
            elif am and not marked_correct:
                marked_correct = map_option_letter(am.group(1))
            else:
                tail.append(pl)
        if tail and options.get('D') and not saw_blank_after_d:
            joined_tail = ' '.join(tail)
            if not joined_tail.endswith('?') and not Q_NUM_PREFIX_RE.match(joined_tail):
                options['D'] = f"{options['D']} {joined_tail}".strip()
        pending_after_d = []

    if has_any_options():
        finalize_question()

    return {'valid': valid, 'errors': errors}


def _reconstruct_pdf_page_lines(page) -> list[str]:
    collected: list[dict] = []

    def visitor_text(text, cm, tm, font_dict, font_size):
        if not text:
            return
        clean = text.replace('\r', '')
        if not clean.strip():
            return
        try:
            tx = float(tm[4])
            ty = float(tm[5])
            if cm and len(cm) >= 6:
                ex = float(cm[0]) * tx + float(cm[2]) * ty + float(cm[4])
                ey = float(cm[1]) * tx + float(cm[3]) * ty + float(cm[5])
            else:
                ex, ey = tx, ty
        except Exception:
            ex, ey = 0.0, 0.0
        fsize = float(font_size or 11.0)
        collected.append({'str': clean, 'x': ex, 'y': ey, 'fontSize': fsize})

    try:
        page.extract_text(visitor_text=visitor_text)
    except TypeError:
        raw = page.extract_text() or ''
        return [l.strip() for l in raw.splitlines() if l.strip()]

    if not collected:
        raw = page.extract_text() or ''
        return [l.strip() for l in raw.splitlines() if l.strip()]

    # Sort descending by Y, ascending by X
    collected.sort(key=lambda item: (-round(item['y'], 2), item['x']))
    buckets: list[dict] = []
    for item in collected:
        tol = max(2.5, item['fontSize'] * 0.45)
        if buckets and abs(item['y'] - buckets[-1]['anchorY']) <= tol:
            buckets[-1]['items'].append(item)
        else:
            buckets.append({'anchorY': item['y'], 'items': [item]})

    lines: list[str] = []
    for idx, bucket in enumerate(buckets):
        bucket['items'].sort(key=lambda it: it['x'])
        parts: list[str] = []
        prev_end_approx: float | None = None
        for it in bucket['items']:
            t = it['str']
            if prev_end_approx is not None and it['x'] - prev_end_approx > max(1.5, it['fontSize'] * 0.18):
                if parts and not parts[-1].endswith(' ') and not t.startswith(' '):
                    parts.append(' ')
            parts.append(t)
            prev_end_approx = it['x'] + len(t) * max(3.0, it['fontSize'] * 0.45)
        line_str = ''.join(parts).strip()
        if line_str:
            lines.append(line_str)
        if idx + 1 < len(buckets):
            nxt = buckets[idx + 1]
            fsize = bucket['items'][0]['fontSize'] or 11.0
            if (bucket['anchorY'] - nxt['anchorY']) > max(18.0, fsize * 1.9):
                lines.append('')
    return lines


def _validate_structured_rows(rows: list[dict]) -> dict:
    valid: list[dict] = []
    errors: list[str] = []
    for idx, r in enumerate(rows):
        norm = {str(k or '').strip().lower(): v for k, v in r.items()}
        q = str(
            norm.get('question_text') or norm.get('question') or norm.get('savol') or ''
        ).strip()
        expr = str(
            norm.get('expression_text') or norm.get('expression') or norm.get('misol') or ''
        ).strip() or None
        a = str(norm.get('option_a') or norm.get('a') or '').strip()
        b = str(norm.get('option_b') or norm.get('b') or '').strip()
        c = str(norm.get('option_c') or norm.get('c') or '').strip()
        d = str(norm.get('option_d') or norm.get('d') or '').strip()
        ans_raw = str(
            norm.get('correct_option') or norm.get('correct') or norm.get('javob') or ''
        ).strip()
        ans = map_option_letter(ans_raw[:1]) if ans_raw else None
        exp = str(norm.get('explanation') or norm.get('izoh') or '').strip()

        row_num = idx + 1
        if not q or not a or not b or not c or not d:
            errors.append(f'{row_num}-qator: Savol matni va A, B, C, D variantlari to‘liq emas.')
            continue
        if ans not in ('A', 'B', 'C', 'D'):
            errors.append(f'{row_num}-qator: To‘g‘ri javob faqat A, B, C yoki D bo‘lishi shart.')
            continue
        valid.append({
            'question_text': q,
            'expression_text': expr,
            'option_a': a,
            'option_b': b,
            'option_c': c,
            'option_d': d,
            'correct_option': ans,
            'explanation': exp,
        })
    return {'valid': valid, 'errors': errors}


def extract_and_parse_test_bytes(raw_bytes: bytes, filename: str = '') -> dict:
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''

    if ext == 'doc':
        if raw_bytes[:4] == b'\xd0\xcf\x11\xe0':
            return {
                'valid': [],
                'errors': [
                    'Eski .doc binary format qo‘llab-quvvatlanmaydi. Iltimos faylni Wordda .docx yoki .pdf formatida saqlab yuklang.'
                ],
                'extracted_preview': '',
            }
        text = re.sub(r'<[^>]+>', '\n', raw_bytes.decode('utf-8', errors='replace'))
        parsed = parse_formatted_test_text(text)
        return {**parsed, 'extracted_preview': text[:600]}

    if ext == 'docx':
        try:
            doc = Document(io.BytesIO(raw_bytes))
            parts: list[str] = []
            for p in doc.paragraphs:
                parts.append(p.text)
            for table in doc.tables:
                for row in table.rows:
                    row_txt = '  '.join(cell.text.strip() for cell in row.cells if cell.text.strip())
                    if row_txt:
                        parts.append(row_txt)
            raw_text = '\n'.join(parts)
            parsed = parse_formatted_test_text(raw_text)
            return {**parsed, 'extracted_preview': raw_text[:600]}
        except Exception as exc:
            return {
                'valid': [],
                'errors': [f'Word (.docx) faylini o‘qib bo‘lmadi ({exc}). Haqiqiy .docx fayl ekanini tekshiring.'],
                'extracted_preview': '',
            }

    if ext == 'pdf':
        try:
            reader = PdfReader(io.BytesIO(raw_bytes))
            if getattr(reader, 'is_encrypted', False):
                try:
                    reader.decrypt('')
                except Exception:
                    return {
                        'valid': [],
                        'errors': ['Bu PDF fayl parol bilan himoyalangan.'],
                        'extracted_preview': '',
                    }
            all_lines: list[str] = []
            total_chars = 0
            for page in reader.pages:
                p_lines = _reconstruct_pdf_page_lines(page)
                total_chars += sum(len(l.strip()) for l in p_lines)
                all_lines.extend(p_lines)
                all_lines.append('')
            if total_chars == 0:
                return {
                    'valid': [],
                    'errors': [
                        'Bu PDF skaner qilingan rasmga o‘xshaydi (matn qatlami topilmadi). Iltimos matnli PDF yoki Word (.docx) yuklang.'
                    ],
                    'extracted_preview': '',
                }
            raw_text = '\n'.join(all_lines)
            parsed = parse_formatted_test_text(raw_text)
            return {**parsed, 'extracted_preview': raw_text[:600]}
        except Exception as exc:
            return {
                'valid': [],
                'errors': [f'PDF faylini o‘qib bo‘lmadi ({exc}).'],
                'extracted_preview': '',
            }

    if ext == 'txt':
        try:
            raw_text = raw_bytes.decode('utf-8-sig')
        except UnicodeDecodeError:
            raw_text = raw_bytes.decode('cp1251', errors='replace')
        parsed = parse_formatted_test_text(raw_text)
        return {**parsed, 'extracted_preview': raw_text[:600]}

    if ext in ('xlsx', 'xlsm'):
        try:
            wb = load_workbook(io.BytesIO(raw_bytes), read_only=True, data_only=True)
            ws = wb.active
            rows_iter = ws.iter_rows(values_only=True)
            headers = [str(c or '').strip() for c in next(rows_iter, ())]
            dict_rows = []
            for row in rows_iter:
                if not any(v is not None and str(v).strip() for v in row):
                    continue
                dict_rows.append({headers[i]: row[i] if i < len(row) else '' for i in range(len(headers))})
            wb.close()
            parsed = _validate_structured_rows(dict_rows)
            return {**parsed, 'extracted_preview': f'Excel ({len(dict_rows)} qator)'}
        except Exception as exc:
            return {
                'valid': [],
                'errors': [f'Excel faylini o‘qib bo‘lmadi ({exc}).'],
                'extracted_preview': '',
            }

    if ext == 'csv':
        try:
            text = raw_bytes.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = raw_bytes.decode('cp1251', errors='replace')
        try:
            sample = text[:2048]
            dialect = csv.Sniffer().sniff(sample, delimiters=',;\t')
        except Exception:
            dialect = csv.excel
        reader = csv.DictReader(io.StringIO(text), dialect=dialect)
        dict_rows = list(reader)
        parsed = _validate_structured_rows(dict_rows)
        return {**parsed, 'extracted_preview': text[:600]}

    if ext == 'json':
        try:
            data = json.loads(raw_bytes.decode('utf-8-sig'))
            if isinstance(data, dict) and isinstance(data.get('questions'), list):
                data = data['questions']
            if not isinstance(data, list):
                return {'valid': [], 'errors': ['JSON massiv ko‘rinishida bo‘lishi kerak.'], 'extracted_preview': ''}
            parsed = _validate_structured_rows(data)
            return {**parsed, 'extracted_preview': json.dumps(data[:2], ensure_ascii=False)[:600]}
        except Exception as exc:
            return {'valid': [], 'errors': [f'JSON xatosi: {exc}'], 'extracted_preview': ''}

    return {
        'valid': [],
        'errors': [f'Qo‘llab-quvvatlanmaydigan fayl turi (.{ext}). Word (.docx), PDF (.pdf), .txt, .xlsx, .csv yoki .json yuklang.'],
        'extracted_preview': '',
    }


def build_sample_docx_bytes() -> bytes:
    doc = Document()
    for line in SAMPLE_TEST_LINES:
        doc.add_paragraph(line)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def build_sample_xlsx_bytes() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = 'Savollar'
    ws.append([
        'question_text',
        'expression_text',
        'option_a',
        'option_b',
        'option_c',
        'option_d',
        'correct_option',
        'explanation',
    ])
    ws.append([
        'O‘zbekiston Respublikasining poytaxti qaysi shahar?',
        '',
        'Toshkent',
        'Samarqand',
        'Buxoro',
        'Xiva',
        'A',
        'Toshkent shahri poytaxt.',
    ])
    ws.append([
        'Ifodaning qiymatini toping:',
        '7 × 8',
        '54',
        '56',
        '64',
        '58',
        'B',
        '7 × 8 = 56.',
    ])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def get_sample_txt_text() -> str:
    return '\n'.join(SAMPLE_TEST_LINES)
