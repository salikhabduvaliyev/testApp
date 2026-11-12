import io
import json
import re
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from .models import Question, QuestionBank, Quiz, Student, Subject, TestAttempt
from .test_parser import (
    build_sample_docx_bytes,
    build_sample_xlsx_bytes,
    extract_and_parse_test_bytes,
    parse_formatted_test_text,
)


def _build_minimal_pdf(lines: list[str]) -> bytes:
    """Create a valid single-page PDF 1.4 with actual positioned BT/ET text lines."""
    def _esc(s: str) -> str:
        return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')

    ops = ['BT', '/F1 12 Tf']
    y = 760
    for ln in lines:
        if ln == '':
            y -= 26
            continue
        ops.append(f'1 0 0 1 50 {y} Tm ({_esc(ln)}) Tj')
        y -= 16
    ops.append('ET')
    stream_bytes = ('\n'.join(ops)).encode('latin-1', errors='replace')

    objs = [
        b'1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
        b'2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
        (
            b'3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
            b'/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n'
        ),
        b'4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
        (
            f'5 0 obj\n<< /Length {len(stream_bytes)} >>\nstream\n'.encode('ascii')
            + stream_bytes
            + b'\nendstream\nendobj\n'
        ),
    ]

    buf = io.BytesIO()
    buf.write(b'%PDF-1.4\n')
    offsets = []
    for obj in objs:
        offsets.append(buf.tell())
        buf.write(obj)
    xref_pos = buf.tell()
    buf.write(f'xref\n0 {len(objs) + 1}\n0000000000 65535 f \n'.encode('ascii'))
    for off in offsets:
        buf.write(f'{off:010d} 00000 n \n'.encode('ascii'))
    buf.write(
        f'trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n'.encode('ascii')
    )
    return buf.getvalue()


class TestParserTests(TestCase):
    def test_parses_hash_inline_cyrillic_and_initials(self):
        raw = """
        ONA TILI TESTLARI — 2026
        Tuzuvchi: O'qituvchi

        1. A. Navoiy qaysi asarni yozgan?
        a) Boburnoma
        #b) Xamsa
        c) O'tkan kunlar
        d) Mehrobdan chayon

        2. Birinchi raqam qaysi? #а) 1 б) 2 в) 3 г) 4

        3. Ko'p qatorli savol matni
        davomi bu yerda
        #a) To'g'ri javob
        birinchi qism davomi
        b) Ikkinchi
        c) Uchinchi
        d) To'rtinchi
        oxirgi davomi
        """
        res = parse_formatted_test_text(raw)
        self.assertEqual(res['errors'], [])
        self.assertEqual(len(res['valid']), 3)
        self.assertTrue(res['valid'][0]['question_text'].startswith('A. Navoiy'))
        self.assertEqual(res['valid'][0]['correct_option'], 'B')
        self.assertEqual(res['valid'][1]['correct_option'], 'A')
        self.assertEqual(res['valid'][1]['option_d'], '4')
        self.assertIn('davomi bu yerda', res['valid'][2]['question_text'])
        self.assertIn('oxirgi davomi', res['valid'][2]['option_d'])

    def test_extracts_docx_pdf_xlsx_and_handles_corrupt(self):
        docx_res = extract_and_parse_test_bytes(build_sample_docx_bytes(), 'ona-tili.docx')
        self.assertEqual(docx_res['errors'], [])
        self.assertEqual(len(docx_res['valid']), 3)

        pdf_bytes = _build_minimal_pdf([
            '1. O\'zbekiston poytaxti?',
            '#a) Toshkent',
            'b) Buxoro',
            'c) Xiva',
            'd) Qo\'qon',
            '',
            '2. 2 + 2 = ?',
            'a) 3',
            '#b) 4',
            'c) 5',
            'd) 6',
        ])
        pdf_res = extract_and_parse_test_bytes(pdf_bytes, 'matem.pdf')
        self.assertEqual(pdf_res['errors'], [])
        self.assertEqual(len(pdf_res['valid']), 2)
        self.assertEqual(pdf_res['valid'][0]['correct_option'], 'A')
        self.assertEqual(pdf_res['valid'][1]['correct_option'], 'B')

        xlsx_res = extract_and_parse_test_bytes(build_sample_xlsx_bytes(), 'savollar.xlsx')
        self.assertEqual(xlsx_res['errors'], [])
        self.assertEqual(len(xlsx_res['valid']), 2)

        bad_pdf = extract_and_parse_test_bytes(b'not-a-pdf', 'broken.pdf')
        self.assertEqual(bad_pdf['valid'], [])
        self.assertTrue(len(bad_pdf['errors']) > 0)

        legacy_doc = extract_and_parse_test_bytes(b'\xd0\xcf\x11\xe0rest', 'old.doc')
        self.assertEqual(legacy_doc['valid'], [])
        self.assertIn('.docx', legacy_doc['errors'][0])


class DonoFullstackAndApiTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_clean_database_and_admin_login(self):
        resp = self.client.get('/')
        self.assertRedirects(resp, '/login/?next=/')

        login_resp = self.client.post('/login/', {'username': 'admin', 'password': 'admin123'})
        self.assertRedirects(login_resp, '/')

        User = get_user_model()
        self.assertEqual(User.objects.filter(username='admin').count(), 1)
        self.assertEqual(Subject.objects.count(), 0)
        self.assertEqual(QuestionBank.objects.count(), 0)
        self.assertEqual(Quiz.objects.count(), 0)
        self.assertEqual(Question.objects.count(), 0)
        self.assertEqual(Student.objects.count(), 0)
        self.assertEqual(TestAttempt.objects.count(), 0)

    def test_admin_upload_and_android_apk_shuffle_workflow(self):
        self.client.post('/login/', {'username': 'admin', 'password': 'admin123'})

        # 1. Create subject
        self.client.post(
            '/subjects/',
            {
                'action': 'save_subject',
                'name': 'Ona tili',
                'description': 'Grammatika testlari',
                'color_hex': '#2563EB',
                'icon_key': 'menu_book',
            },
        )
        sub = Subject.objects.get(name='Ona tili')

        # 2. Parse 15 questions from TXT via upload API
        txt_lines = []
        for idx in range(1, 16):
            txt_lines.extend([
                f'{idx}. Savol raqami #{idx}?',
                f'#a) To\'g\'ri-{idx}',
                f'b) XatoB-{idx}',
                f'c) XatoC-{idx}',
                f'd) XatoD-{idx}',
                '',
            ])
        parse_res = self.client.post(
            '/api/admin/parse-test-file',
            data='\n'.join(txt_lines).encode('utf-8'),
            content_type='application/octet-stream',
            HTTP_X_FILE_NAME='Ona%20tili%20yangi.txt',
        )
        self.assertEqual(parse_res.status_code, 200)
        parsed = parse_res.json()
        self.assertEqual(len(parsed['valid']), 15)

        # 2.5 Test sample downloads & multipart parse-test-file
        self.assertEqual(self.client.get('/api/admin/sample-test?format=docx').status_code, 200)
        self.assertEqual(self.client.get('/api/admin/sample-test?format=txt').status_code, 200)
        self.assertEqual(self.client.get('/api/admin/sample-test?format=xlsx').status_code, 200)

        # 3. Save QuestionBank + auto_create_quiz
        save_res = self.client.post(
            '/api/admin/banks',
            data=json.dumps({
                'title': 'Ona tili yangi',
                'subject_id': str(sub.id),
                'source_type': 'txt',
                'questions': parsed['valid'],
                'auto_create_quiz': True,
                'time_per_question_sec': 20,
                'points_per_correct': 5,
            }),
            content_type='application/json',
        )
        self.assertEqual(save_res.status_code, 201)
        bank_id = save_res.json()['id']
        quiz_id = save_res.json()['quiz_id']
        self.assertEqual(Question.objects.filter(bank_id=bank_id).count(), 15)

        # Verify all web admin pages render cleanly without template errors and disable browser auto-translate
        login_page = Client().get('/login/')
        self.assertContains(login_page, 'name="google" content="notranslate"')
        self.assertContains(login_page, 'translate="no"')

        dash_page = self.client.get('/')
        self.assertEqual(dash_page.status_code, 200)
        self.assertContains(dash_page, 'name="google" content="notranslate"')
        self.assertContains(dash_page, 'translate="no"')
        subj_page = self.client.get(f'/subjects/?subject={sub.id}')
        self.assertContains(subj_page, 'Ona tili yangi')
        tests_page = self.client.get('/tests/')
        self.assertContains(tests_page, '1. Ona tili yangi')
        detail_page = self.client.get(f'/tests/{bank_id}/')
        self.assertContains(detail_page, 'Savol raqami #1?')

        # Single question add/edit/delete via HTML form
        self.client.post(
            f'/tests/{bank_id}/',
            {
                'action': 'save_question',
                'question_text': 'Yangi qoshilgan savol?',
                'option_a': 'A javob',
                'option_b': 'B javob',
                'option_c': "To'g'ri-16",
                'option_d': 'D javob',
                'correct_option': 'C',
                'explanation': 'Izoh',
            },
        )
        self.assertEqual(Question.objects.filter(bank_id=bank_id).count(), 16)
        extra_q = Question.objects.get(bank_id=bank_id, question_text='Yangi qoshilgan savol?')
        self.client.post(
            f'/tests/{bank_id}/',
            {
                'action': 'save_question',
                'question_id': str(extra_q.id),
                'question_text': 'Tahrirlangan savol?',
                'option_a': 'A javob',
                'option_b': 'B javob',
                'option_c': "To'g'ri-16",
                'option_d': 'D javob',
                'correct_option': 'C',
                'explanation': 'Yangilangan izoh',
            },
        )
        extra_q.refresh_from_db()
        self.assertEqual(extra_q.question_text, 'Tahrirlangan savol?')
        self.client.post(
            f'/tests/{bank_id}/',
            {'action': 'delete_question', 'question_id': str(extra_q.id)},
        )
        self.assertEqual(Question.objects.filter(bank_id=bank_id).count(), 15)

        # 4. Android APK: Login with phone uniqueness
        anon = Client()
        s_res = anon.post(
            '/api/student/login',
            data=json.dumps({'device_id': 'dev1', 'full_name': 'Ali Valiyev', 'phone': '90 123 45 67'}),
            content_type='application/json',
        )
        self.assertEqual(s_res.status_code, 200)
        student = s_res.json()
        self.assertEqual(student['phone'], '+998901234567')

        # Different user with same phone -> 409 Conflict
        conflict_res = anon.post(
            '/api/student/login',
            data=json.dumps({'device_id': 'dev2', 'full_name': 'Boshqa Odam', 'phone': '+998901234567'}),
            content_type='application/json',
        )
        self.assertEqual(conflict_res.status_code, 409)

        # Reordered name with same phone -> allowed
        relog_res = anon.post(
            '/api/student/login',
            data=json.dumps({'device_id': 'dev1', 'full_name': 'Valiyev Ali', 'phone': '+998901234567'}),
            content_type='application/json',
        )
        self.assertEqual(relog_res.status_code, 200)

        # 5. Android APK: Fetch subjects, quizzes, and shuffled 10 questions
        subs = anon.get('/api/subjects').json()
        self.assertEqual(len(subs), 1)
        self.assertEqual(subs[0]['question_count'], 15)

        quizzes = anon.get(f'/api/subjects/{sub.id}/quizzes').json()
        self.assertEqual(len(quizzes), 1)

        seen_letters = set()
        seen_first_ids = set()
        for _ in range(10):
            qs = anon.get(f'/api/quizzes/{quiz_id}/questions?limit=10').json()
            self.assertEqual(len(qs), 10)
            seen_first_ids.add(qs[0]['id'])
            for item in qs:
                seen_letters.add(item['correct_option'])
                chosen_text = item['option_' + item['correct_option'].lower()]
                self.assertTrue(chosen_text.startswith("To'g'ri-"))

        # Must randomize both question order and option letters
        self.assertGreater(len(seen_letters), 1)
        self.assertGreater(len(seen_first_ids), 1)

        # 6. Android APK: Submit test attempt with shuffled_token
        picked = anon.get(f'/api/quizzes/{quiz_id}/questions?limit=10').json()
        submissions = []
        for idx, q in enumerate(picked):
            submissions.append({
                'question_id': q['id'],
                'selected_option': q['correct_option'] if idx < 7 else ('B' if q['correct_option'] != 'B' else 'A'),
                'shuffled_token': q['shuffled_token'],
            })
        att_res = anon.post(
            '/api/attempts',
            data=json.dumps({
                'student_id': student['id'],
                'quiz_id': quiz_id,
                'requested_count': 10,
                'duration_sec': 45,
                'answers': submissions,
            }),
            content_type='application/json',
        )
        self.assertEqual(att_res.status_code, 200)
        att_json = att_res.json()
        self.assertEqual(att_json['correct_count'], 7)
        self.assertEqual(att_json['wrong_count'], 3)
        self.assertEqual(att_json['earned_points'], 35)

        # 7. Leaderboard, history, Admin HTML pages (students, results, overview, heartbeat) & CSV export
        lb_res = anon.get(f'/api/leaderboard?student_id={student["id"]}&scope=all')
        self.assertEqual(lb_res.status_code, 200)
        self.assertEqual(lb_res.json()[0]['total_points'], 35)

        hist_res = anon.get(f'/api/students/{student["id"]}/history')
        self.assertEqual(hist_res.status_code, 200)
        self.assertEqual(len(hist_res.json()), 1)

        self.assertContains(self.client.get('/students/'), 'Ali Valiyev')
        self.assertContains(self.client.get('/results/'), 'Ali Valiyev')
        self.assertEqual(self.client.get('/api/admin/heartbeat').status_code, 200)
        self.assertEqual(self.client.get('/api/admin/overview').status_code, 200)

        csv_res = self.client.get('/results/export/')
        self.assertEqual(csv_res.status_code, 200)
        self.assertIn('Ali Valiyev', csv_res.content.decode('utf-8'))

        self.assertEqual(anon.get('/api/health').json()['framework'], 'Django')
        self.assertEqual(anon.get('/api/subjects/not-a-uuid/quizzes').status_code, 200)
        self.assertEqual(anon.get('/api/subjects/not-a-uuid/quizzes').json(), [])
        self.assertEqual(self.client.patch('/api/admin/banks/not-a-uuid', data='{}', content_type='application/json').status_code, 404)
