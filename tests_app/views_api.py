import json
import secrets
import uuid
from urllib.parse import unquote

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db import transaction
from django.db.models import Avg, Count, Q
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import (
    AttemptAnswer,
    Friendship,
    Question,
    QuestionBank,
    Quiz,
    Student,
    Subject,
    TestAttempt,
)
from .test_parser import (
    build_sample_docx_bytes,
    build_sample_xlsx_bytes,
    extract_and_parse_test_bytes,
    get_sample_txt_text,
)
from .utils import (
    compute_level_name,
    generate_recovery_code,
    names_belong_to_same_person,
    normalize_full_name,
    normalize_phone,
    sign_shuffled_answer,
    split_full_name,
    verify_shuffled_answer,
)

_CSPRNG = secrets.SystemRandom()
_ADMIN_BOOTSTRAPPED = False


def _is_valid_uuid(val) -> bool:
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def ensure_default_admin_lazy():
    global _ADMIN_BOOTSTRAPPED
    if _ADMIN_BOOTSTRAPPED:
        return
    User = get_user_model()
    username = getattr(settings, 'DEFAULT_ADMIN_USERNAME', 'admin')
    password = getattr(settings, 'DEFAULT_ADMIN_PASSWORD', 'admin123')
    if not User.objects.filter(username=username).exists():
        User.objects.create_superuser(
            username=username,
            email=f'{username}@example.com',
            password=password,
            first_name='Bosh Admin',
        )
    _ADMIN_BOOTSTRAPPED = True


def _json_body(request) -> dict:
    if not request.body:
        return {}
    try:
        data = json.loads(request.body.decode('utf-8'))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _is_admin_authenticated(request) -> bool:
    return bool(request.user.is_authenticated and request.user.is_staff)


def _require_admin_json(request):
    if not _is_admin_authenticated(request):
        return JsonResponse({'message': 'Admin avtorizatsiyasi talab qilinadi.'}, status=401)
    return None


def _iso(dt) -> str:
    if not dt:
        return ''
    return timezone.localtime(dt).isoformat()


def _serialize_student(s: Student) -> dict:
    return {
        'id': str(s.id),
        'phone': s.phone,
        'full_name': s.full_name,
        'first_name': s.first_name,
        'last_name': s.last_name,
        'device_id': s.device_id,
        'recovery_code': s.recovery_code,
        'region': s.region,
        'total_points': s.total_points,
        'streak_days': s.streak_days,
        'daily_questions_count': s.daily_questions_count,
        'daily_goal_target': s.daily_goal_target,
        'last_active_date': str(s.last_active_date),
        'last_active_at': _iso(s.last_active_at),
        'created_at': _iso(s.created_at),
        'level_name': compute_level_name(s.total_points),
    }


def _compute_heartbeat_payload() -> dict:
    latest_attempt = TestAttempt.objects.order_by('-completed_at').values_list('id', 'completed_at').first()
    latest_student = Student.objects.order_by('-last_active_at').values_list('id', 'last_active_at').first()
    counts = (
        Subject.objects.count(),
        QuestionBank.objects.count(),
        Quiz.objects.count(),
        Question.objects.count(),
        Student.objects.count(),
        TestAttempt.objects.count(),
    )
    signature = f'{counts}:{latest_attempt}:{latest_student}'
    return {
        'version': signature,
        'total_students': counts[4],
        'total_attempts': counts[5],
    }


# ── HEALTH ───────────────────────────────────────────────────────────────

def api_health(request):
    return JsonResponse({
        'ok': True,
        'service': 'DONO',
        'framework': 'Django',
        'database': 'SQLite',
    })


# ── ADMIN AUTH API ───────────────────────────────────────────────────────

def api_admin_me(request):
    if not _is_admin_authenticated(request):
        return JsonResponse({'authenticated': False}, status=401)
    return JsonResponse({'authenticated': True, 'username': request.user.username})


@csrf_exempt
@require_http_methods(['POST'])
def api_admin_login(request):
    ensure_default_admin_lazy()
    b = _json_body(request)
    username = str(b.get('username') or '').strip()
    password = str(b.get('password') or '')
    user = authenticate(request, username=username, password=password)
    if user is None or not user.is_staff:
        return JsonResponse({'message': 'Login yoki parol noto‘g‘ri.'}, status=401)
    login(request, user)
    return JsonResponse({
        'ok': True,
        'username': user.username,
        'full_name': user.get_full_name() or user.username,
    })


@csrf_exempt
@require_http_methods(['POST'])
def api_admin_logout(request):
    logout(request)
    return JsonResponse({'ok': True})


def api_admin_heartbeat(request):
    err = _require_admin_json(request)
    if err:
        return err
    return JsonResponse(_compute_heartbeat_payload())


def api_admin_overview(request):
    err = _require_admin_json(request)
    if err:
        return err

    today = timezone.localdate()
    avg_score = TestAttempt.objects.aggregate(avg=Avg('score_percent'))['avg'] or 0.0

    stats = {
        'total_students': Student.objects.count(),
        'active_today': Student.objects.filter(last_active_date=today).count(),
        'total_attempts': TestAttempt.objects.count(),
        'avg_score_percent': round(float(avg_score)),
        'total_subjects': Subject.objects.count(),
        'total_quizzes': Quiz.objects.count(),
        'total_banks': QuestionBank.objects.count(),
        'total_questions': Question.objects.count(),
    }

    subjects = [
        {
            'id': str(s.id),
            'name': s.name,
            'description': s.description,
            'icon_key': s.icon_key,
            'color_hex': s.color_hex,
            'sort_order': s.sort_order,
            'is_active': bool(s.is_active),
            'created_at': _iso(s.created_at),
        }
        for s in Subject.objects.all()
    ]

    banks_qs = QuestionBank.objects.select_related('subject').annotate(
        question_count=Count('questions', distinct=True),
        linked_quiz_count=Count('quizzes', distinct=True),
    )
    banks = [
        {
            'id': str(b.id),
            'title': b.title,
            'description': b.description,
            'subject_id': str(b.subject_id) if b.subject_id else None,
            'subject_name': b.subject.name if b.subject else '',
            'subject_hint': b.subject_hint,
            'source_type': b.source_type,
            'question_count': b.question_count,
            'linked_quiz_count': b.linked_quiz_count,
            'created_at': _iso(b.created_at),
        }
        for b in banks_qs
    ]

    quizzes = []
    for qz in Quiz.objects.prefetch_related('banks').annotate(
        question_count=Count('banks__questions', distinct=True)
    ):
        quizzes.append({
            'id': str(qz.id),
            'subject_id': str(qz.subject_id),
            'title': qz.title,
            'description': qz.description,
            'time_per_question_sec': qz.time_per_question_sec,
            'points_per_correct': qz.points_per_correct,
            'is_active': bool(qz.is_active),
            'bank_ids': [str(bk.id) for bk in qz.banks.all()],
            'question_count': qz.question_count,
            'created_at': _iso(qz.created_at),
        })

    questions = [
        {
            'id': str(q.id),
            'bank_id': str(q.bank_id),
            'quiz_id': str(q.legacy_quiz_id) if q.legacy_quiz_id else None,
            'question_text': q.question_text,
            'expression_text': q.expression_text,
            'option_a': q.option_a,
            'option_b': q.option_b,
            'option_c': q.option_c,
            'option_d': q.option_d,
            'correct_option': q.correct_option,
            'explanation': q.explanation,
            'created_at': _iso(q.created_at),
        }
        for q in Question.objects.order_by('-created_at')[:2000]
    ]

    students = [_serialize_student(s) for s in Student.objects.all()]

    attempts = []
    for att in TestAttempt.objects.select_related('student', 'subject', 'quiz')[:150]:
        attempts.append({
            'id': str(att.id),
            'student_id': str(att.student_id),
            'subject_id': str(att.subject_id),
            'quiz_id': str(att.quiz_id),
            'requested_count': att.requested_count,
            'total_questions': att.total_questions,
            'correct_count': att.correct_count,
            'wrong_count': att.wrong_count,
            'earned_points': att.earned_points,
            'duration_sec': att.duration_sec,
            'score_percent': att.score_percent,
            'completed_at': _iso(att.completed_at),
            'students': {
                'first_name': att.student.first_name,
                'last_name': att.student.last_name,
                'full_name': att.student.full_name,
                'phone': att.student.phone,
                'region': att.student.region,
            },
            'subjects': {'name': att.subject.name},
            'quizzes': {'title': att.quiz.title},
        })

    return JsonResponse({
        'stats': stats,
        'subjects': subjects,
        'banks': banks,
        'quizzes': quizzes,
        'questions': questions,
        'students': students,
        'attempts': attempts,
    })


# ── ADMIN FILE PARSING & SAMPLES ─────────────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def api_admin_parse_test_file(request):
    err = _require_admin_json(request)
    if err:
        return err

    uploaded = request.FILES.get('file')
    if uploaded is not None:
        raw_bytes = uploaded.read()
        filename = uploaded.name
    else:
        raw_name = request.headers.get('X-File-Name') or request.META.get('HTTP_X_FILE_NAME') or 'test.docx'
        try:
            filename = unquote(str(raw_name))
        except Exception:
            filename = str(raw_name)
        raw_bytes = request.body

    result = extract_and_parse_test_bytes(raw_bytes, filename)
    return JsonResponse(result)


def api_admin_sample_test(request):
    err = _require_admin_json(request)
    if err:
        return err

    fmt = (request.GET.get('format') or 'docx').lower().strip()
    if fmt == 'txt':
        resp = HttpResponse(get_sample_txt_text(), content_type='text/plain; charset=utf-8')
        resp['Content-Disposition'] = 'attachment; filename="dono-test-namuna.txt"'
        return resp
    if fmt == 'xlsx':
        resp = HttpResponse(
            build_sample_xlsx_bytes(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        resp['Content-Disposition'] = 'attachment; filename="dono-test-namuna.xlsx"'
        return resp

    resp = HttpResponse(
        build_sample_docx_bytes(),
        content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    resp['Content-Disposition'] = 'attachment; filename="dono-test-namuna.docx"'
    return resp


# ── ADMIN SUBJECTS CRUD ──────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def api_admin_subjects(request):
    err = _require_admin_json(request)
    if err:
        return err
    b = _json_body(request)
    name = str(b.get('name') or '').strip()
    if not name:
        return JsonResponse({'message': 'Fan nomi kiritilishi shart.'}, status=400)
    sub = Subject.objects.create(
        name=name,
        description=str(b.get('description') or ''),
        icon_key=str(b.get('icon_key') or 'menu_book'),
        color_hex=str(b.get('color_hex') or '#2563EB'),
        sort_order=int(b.get('sort_order') or 0),
        is_active=(b.get('is_active') is not False),
    )
    return JsonResponse({'id': str(sub.id)}, status=201)


@csrf_exempt
@require_http_methods(['PATCH', 'DELETE'])
def api_admin_subject_detail(request, subject_id):
    err = _require_admin_json(request)
    if err:
        return err
    sub = Subject.objects.filter(id=subject_id).first() if _is_valid_uuid(subject_id) else None
    if not sub:
        return JsonResponse({'message': 'Fan topilmadi.'}, status=404)

    if request.method == 'DELETE':
        sub.delete()
        return JsonResponse({'ok': True})

    b = _json_body(request)
    if 'name' in b and str(b['name']).strip():
        sub.name = str(b['name']).strip()
    if 'description' in b:
        sub.description = str(b['description'] or '')
    if 'icon_key' in b:
        sub.icon_key = str(b['icon_key'] or sub.icon_key)
    if 'color_hex' in b:
        sub.color_hex = str(b['color_hex'] or sub.color_hex)
    if 'sort_order' in b:
        sub.sort_order = int(b['sort_order'] or 0)
    if 'is_active' in b:
        sub.is_active = bool(b['is_active'])
    sub.save()
    return JsonResponse({'ok': True})


# ── ADMIN QUESTION BANKS ("TESTLAR") CRUD ────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def api_admin_banks(request):
    err = _require_admin_json(request)
    if err:
        return err
    b = _json_body(request)
    title = str(b.get('title') or '').strip()
    if not title:
        return JsonResponse({'message': 'Test nomi kiritilishi shart.'}, status=400)

    raw_sub_id = str(b.get('subject_id') or '').strip()
    sub = Subject.objects.filter(id=raw_sub_id).first() if _is_valid_uuid(raw_sub_id) else None
    resolved_hint = sub.name if sub else str(b.get('subject_hint') or '').strip()
    source_type = str(b.get('source_type') or '').strip().lower()
    items = b.get('questions') if isinstance(b.get('questions'), list) else []
    auto_create_quiz = bool(sub and b.get('auto_create_quiz'))

    created_quiz = None
    with transaction.atomic():
        bank = QuestionBank.objects.create(
            title=title,
            description=str(b.get('description') or '').strip(),
            subject=sub,
            subject_hint=resolved_hint,
            source_type=source_type,
        )
        objs = [
            Question(
                bank=bank,
                question_text=str(q.get('question_text') or '').strip(),
                expression_text=(str(q['expression_text']).strip() if q.get('expression_text') else None),
                option_a=str(q.get('option_a') or '').strip(),
                option_b=str(q.get('option_b') or '').strip(),
                option_c=str(q.get('option_c') or '').strip(),
                option_d=str(q.get('option_d') or '').strip(),
                correct_option=str(q.get('correct_option') or 'A').strip().upper(),
                explanation=str(q.get('explanation') or '').strip(),
            )
            for q in items
        ]
        if objs:
            Question.objects.bulk_create(objs)

        if auto_create_quiz and sub:
            created_quiz = Quiz.objects.create(
                subject=sub,
                title=title,
                description=str(b.get('description') or f'{len(objs)} ta savolli test bazasi').strip(),
                time_per_question_sec=max(0, int(b.get('time_per_question_sec', 20))),
                points_per_correct=max(1, int(b.get('points_per_correct', 5))),
                is_active=True,
            )
            created_quiz.banks.add(bank)

    return JsonResponse(
        {
            'id': str(bank.id),
            'quiz_id': str(created_quiz.id) if created_quiz else None,
            'inserted': len(items),
        },
        status=201,
    )


@csrf_exempt
@require_http_methods(['PATCH', 'DELETE'])
def api_admin_bank_detail(request, bank_id):
    err = _require_admin_json(request)
    if err:
        return err
    bank = QuestionBank.objects.filter(id=bank_id).first() if _is_valid_uuid(bank_id) else None
    if not bank:
        return JsonResponse({'message': 'Test topilmadi.'}, status=404)

    if request.method == 'DELETE':
        bank.delete()
        return JsonResponse({'ok': True})

    b = _json_body(request)
    if 'title' in b and str(b['title']).strip():
        bank.title = str(b['title']).strip()
    if 'description' in b:
        bank.description = str(b['description'] or '').strip()
    if 'subject_id' in b:
        raw_sub = str(b['subject_id'] or '').strip()
        sub = Subject.objects.filter(id=raw_sub).first() if _is_valid_uuid(raw_sub) else None
        bank.subject = sub
        bank.subject_hint = sub.name if sub else str(b.get('subject_hint') or '').strip()
    elif 'subject_hint' in b:
        bank.subject_hint = str(b['subject_hint'] or '').strip()
    bank.save()
    return JsonResponse({'ok': True})


# ── ADMIN QUIZZES CRUD ───────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def api_admin_quizzes(request):
    err = _require_admin_json(request)
    if err:
        return err
    b = _json_body(request)
    raw_sub_id = str(b.get('subject_id') or '').strip()
    sub = Subject.objects.filter(id=raw_sub_id).first() if _is_valid_uuid(raw_sub_id) else None
    if not sub:
        return JsonResponse({'message': 'Fan topilmadi.'}, status=404)
    title = str(b.get('title') or '').strip()
    if not title:
        return JsonResponse({'message': 'Test to‘plami nomi kiritilishi shart.'}, status=400)

    bank_ids = b.get('bank_ids') if isinstance(b.get('bank_ids'), list) else []
    valid_bank_ids = [str(x) for x in bank_ids if _is_valid_uuid(x)]
    with transaction.atomic():
        qz = Quiz.objects.create(
            subject=sub,
            title=title,
            description=str(b.get('description') or ''),
            time_per_question_sec=max(0, int(b.get('time_per_question_sec', 20))),
            points_per_correct=max(1, int(b.get('points_per_correct', 5))),
            is_active=(b.get('is_active') is not False),
        )
        if valid_bank_ids:
            banks = QuestionBank.objects.filter(id__in=valid_bank_ids)
            qz.banks.set(banks)

    return JsonResponse({'id': str(qz.id)}, status=201)


@csrf_exempt
@require_http_methods(['PATCH', 'DELETE'])
def api_admin_quiz_detail(request, quiz_id):
    err = _require_admin_json(request)
    if err:
        return err
    qz = Quiz.objects.filter(id=quiz_id).first() if _is_valid_uuid(quiz_id) else None
    if not qz:
        return JsonResponse({'message': 'Test to‘plami topilmadi.'}, status=404)

    if request.method == 'DELETE':
        qz.delete()
        return JsonResponse({'ok': True})

    b = _json_body(request)
    with transaction.atomic():
        if 'title' in b and str(b['title']).strip():
            qz.title = str(b['title']).strip()
        if 'description' in b:
            qz.description = str(b['description'] or '')
        if 'time_per_question_sec' in b:
            qz.time_per_question_sec = max(0, int(b['time_per_question_sec']))
        if 'points_per_correct' in b:
            qz.points_per_correct = max(1, int(b['points_per_correct']))
        if 'is_active' in b:
            qz.is_active = bool(b['is_active'])
        qz.save()
        if isinstance(b.get('bank_ids'), list):
            valid_bank_ids = [str(x) for x in b['bank_ids'] if _is_valid_uuid(x)]
            banks = QuestionBank.objects.filter(id__in=valid_bank_ids) if valid_bank_ids else QuestionBank.objects.none()
            qz.banks.set(banks)
    return JsonResponse({'ok': True})


# ── ADMIN QUESTIONS CRUD ─────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def api_admin_questions(request):
    err = _require_admin_json(request)
    if err:
        return err
    b = _json_body(request)
    items = b.get('questions') if isinstance(b.get('questions'), list) else [b]
    to_create = []
    for q in items:
        bank_id = str(q.get('bank_id') or b.get('bank_id') or '').strip()
        legacy_quiz_id = q.get('quiz_id') or b.get('quiz_id') or None
        if legacy_quiz_id and not _is_valid_uuid(legacy_quiz_id):
            legacy_quiz_id = None
        if not bank_id and legacy_quiz_id:
            qz = Quiz.objects.filter(id=legacy_quiz_id).prefetch_related('banks').first()
            if qz and qz.banks.exists():
                bank_id = str(qz.banks.first().id)
        bank = QuestionBank.objects.filter(id=bank_id).first() if _is_valid_uuid(bank_id) else None
        if not bank:
            return JsonResponse({'message': 'Savol qo‘shish uchun test tanlanishi shart.'}, status=400)
        to_create.append(
            Question(
                bank=bank,
                legacy_quiz_id=legacy_quiz_id,
                question_text=str(q.get('question_text') or '').strip(),
                expression_text=(str(q['expression_text']).strip() if q.get('expression_text') else None),
                option_a=str(q.get('option_a') or '').strip(),
                option_b=str(q.get('option_b') or '').strip(),
                option_c=str(q.get('option_c') or '').strip(),
                option_d=str(q.get('option_d') or '').strip(),
                correct_option=str(q.get('correct_option') or 'A').strip().upper(),
                explanation=str(q.get('explanation') or '').strip(),
            )
        )
    Question.objects.bulk_create(to_create)
    return JsonResponse({'inserted': len(to_create)}, status=201)


@csrf_exempt
@require_http_methods(['PATCH', 'DELETE'])
def api_admin_question_detail(request, question_id):
    err = _require_admin_json(request)
    if err:
        return err
    q = Question.objects.filter(id=question_id).first() if _is_valid_uuid(question_id) else None
    if not q:
        return JsonResponse({'message': 'Savol topilmadi.'}, status=404)

    if request.method == 'DELETE':
        q.delete()
        return JsonResponse({'ok': True})

    b = _json_body(request)
    for field in ('question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'explanation'):
        if field in b:
            setattr(q, field, str(b[field] or '').strip())
    if 'expression_text' in b:
        q.expression_text = str(b['expression_text']).strip() if b['expression_text'] else None
    if 'correct_option' in b:
        opt = str(b['correct_option'] or '').strip().upper()
        if opt in ('A', 'B', 'C', 'D'):
            q.correct_option = opt
    q.save()
    return JsonResponse({'ok': True})


# ── PUBLIC ANDROID APK API ───────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def api_student_login(request):
    b = _json_body(request)
    phone = normalize_phone(b.get('phone'))
    raw_name = normalize_full_name(
        b.get('full_name') or f"{str(b.get('first_name') or '').strip()} {str(b.get('last_name') or '').strip()}"
    )
    device_id = str(b.get('device_id') or '').strip()
    region = str(b.get('region') or '').strip() or 'O‘zbekiston'

    if len(raw_name) < 3:
        return JsonResponse({'message': 'F.I.O (to‘liq ism-familiya) kiritilishi shart.'}, status=400)
    if not phone:
        return JsonResponse(
            {'message': 'To‘g‘ri telefon raqamini kiriting (masalan: +998 90 123 45 67).'},
            status=400,
        )

    today = timezone.localdate()
    yesterday = today - timezone.timedelta(days=1)

    with transaction.atomic():
        st = Student.objects.filter(phone=phone).first()
        if not st:
            first_name, last_name = split_full_name(raw_name)
            st = Student.objects.create(
                phone=phone,
                full_name=raw_name,
                first_name=first_name,
                last_name=last_name,
                device_id=device_id,
                recovery_code=generate_recovery_code(),
                region=region,
                last_active_date=today,
            )
        else:
            existing_name = st.full_name or f'{st.first_name} {st.last_name}'.strip()
            if not names_belong_to_same_person(existing_name, raw_name):
                return JsonResponse(
                    {
                        'message': (
                            'Bu telefon raqami allaqachon boshqa foydalanuvchiga biriktirilgan. '
                            'Har bir telefon raqam faqat bitta foydalanuvchiga tegishli.'
                        )
                    },
                    status=409,
                )
            if st.last_active_date == today:
                next_streak = st.streak_days
                next_daily = st.daily_questions_count
            elif st.last_active_date == yesterday:
                next_streak = st.streak_days + 1
                next_daily = 0
            else:
                next_streak = 1
                next_daily = 0

            kept_name = raw_name if len(raw_name) > len(existing_name) else existing_name
            first_name, last_name = split_full_name(kept_name)
            st.full_name = kept_name
            st.first_name = first_name
            st.last_name = last_name
            st.device_id = device_id or st.device_id
            st.streak_days = next_streak
            st.daily_questions_count = next_daily
            st.last_active_date = today
            st.save()

    return JsonResponse(_serialize_student(st))


@csrf_exempt
@require_http_methods(['POST'])
def api_student_recover(request):
    b = _json_body(request)
    code = str(b.get('recovery_code') or '').strip().upper()
    new_device = str(b.get('new_device_id') or '').strip()
    st = Student.objects.filter(recovery_code__iexact=code).first()
    if not st:
        return JsonResponse({'message': 'Tiklash kodi topilmadi.'}, status=404)
    st.device_id = new_device
    st.save()
    return JsonResponse(_serialize_student(st))


@csrf_exempt
@require_http_methods(['POST'])
def api_student_friends(request):
    b = _json_body(request)
    student_id = str(b.get('student_id') or '').strip()
    raw_input = str(b.get('friend_code') or b.get('phone') or '').strip()
    me = Student.objects.filter(id=student_id).first() if _is_valid_uuid(student_id) else None
    if not me:
        return JsonResponse({'message': 'Foydalanuvchi topilmadi.'}, status=404)

    as_phone = normalize_phone(raw_input)
    as_code = raw_input.upper()
    if as_phone:
        friend = Student.objects.filter(Q(phone=as_phone) | Q(recovery_code__iexact=as_code)).first()
    else:
        friend = Student.objects.filter(recovery_code__iexact=as_code).first()

    if not friend:
        return JsonResponse({'message': 'Bunday telefon raqamli yoki kodli foydalanuvchi topilmadi.'}, status=404)
    if friend.id == me.id:
        return JsonResponse({'message': 'O‘zingizni do‘st sifatida qo‘sholmaysiz.'}, status=400)

    Friendship.objects.get_or_create(student=me, friend=friend)
    Friendship.objects.get_or_create(student=friend, friend=me)
    return JsonResponse({'ok': True, 'full_name': friend.full_name})


def api_subjects(request):
    rows = []
    for s in Subject.objects.filter(is_active=True).annotate(
        quiz_count=Count('quizzes', filter=Q(quizzes__is_active=True), distinct=True),
        question_count=Count(
            'quizzes__banks__questions',
            filter=Q(quizzes__is_active=True),
            distinct=True,
        ),
    ):
        rows.append({
            'id': str(s.id),
            'name': s.name,
            'description': s.description,
            'icon_key': s.icon_key,
            'color_hex': s.color_hex,
            'sort_order': s.sort_order,
            'quiz_count': s.quiz_count,
            'question_count': s.question_count,
        })
    return JsonResponse(rows, safe=False)


def api_subject_quizzes(request, subject_id):
    if not _is_valid_uuid(subject_id):
        return JsonResponse([], safe=False)
    rows = []
    for qz in Quiz.objects.filter(subject_id=subject_id, is_active=True).annotate(
        question_count=Count('banks__questions', distinct=True)
    ):
        rows.append({
            'id': str(qz.id),
            'subject_id': str(qz.subject_id),
            'title': qz.title,
            'description': qz.description,
            'time_per_question_sec': qz.time_per_question_sec,
            'points_per_correct': qz.points_per_correct,
            'question_count': qz.question_count,
        })
    return JsonResponse(rows, safe=False)


def api_quiz_questions(request, quiz_id):
    if not _is_valid_uuid(quiz_id):
        return JsonResponse([], safe=False)
    try:
        limit = max(1, min(100, int(request.GET.get('limit') or 10)))
    except ValueError:
        limit = 10

    all_qs = list(
        Question.objects.filter(
            bank__quizzes__id=quiz_id,
            bank__quizzes__is_active=True,
        ).distinct()
    )
    _CSPRNG.shuffle(all_qs)
    picked = all_qs[:limit]

    letters = ['A', 'B', 'C', 'D']
    payload = []
    for q in picked:
        pairs = [
            ('A', q.option_a),
            ('B', q.option_b),
            ('C', q.option_c),
            ('D', q.option_d),
        ]
        _CSPRNG.shuffle(pairs)
        correct_idx = next((idx for idx, p in enumerate(pairs) if p[0] == q.correct_option), 0)
        new_correct = letters[correct_idx]
        payload.append({
            'id': str(q.id),
            'bank_id': str(q.bank_id),
            'quiz_id': str(quiz_id),
            'question_text': q.question_text,
            'expression_text': q.expression_text,
            'option_a': pairs[0][1],
            'option_b': pairs[1][1],
            'option_c': pairs[2][1],
            'option_d': pairs[3][1],
            'correct_option': new_correct,
            'shuffled_token': sign_shuffled_answer(str(q.id), new_correct),
            'explanation': q.explanation,
        })
    return JsonResponse(payload, safe=False)


@csrf_exempt
@require_http_methods(['POST'])
def api_attempts(request):
    b = _json_body(request)
    raw_student_id = str(b.get('student_id') or '').strip()
    raw_quiz_id = str(b.get('quiz_id') or '').strip()
    student = Student.objects.filter(id=raw_student_id).first() if _is_valid_uuid(raw_student_id) else None
    quiz = Quiz.objects.select_related('subject').filter(id=raw_quiz_id).first() if _is_valid_uuid(raw_quiz_id) else None
    if not student or not quiz:
        return JsonResponse({'message': 'O‘quvchi yoki test topilmadi.'}, status=404)

    answers = b.get('answers') if isinstance(b.get('answers'), list) else []
    q_ids = [str(a.get('question_id') or '') for a in answers if _is_valid_uuid(a.get('question_id'))]
    allowed_qs = {
        str(q.id): q
        for q in Question.objects.filter(id__in=q_ids, bank__quizzes=quiz).distinct()
    }

    total = 0
    correct = 0
    wrong = 0
    graded = []
    for ans in answers:
        qid = str(ans.get('question_id') or '')
        q = allowed_qs.get(qid)
        if not q:
            continue
        selected = str(ans['selected_option']).strip().upper() if ans.get('selected_option') else None
        expected_correct = (
            verify_shuffled_answer(ans.get('shuffled_token'), qid)
            if ans.get('shuffled_token')
            else q.correct_option
        )
        is_correct = bool(selected and expected_correct and selected == expected_correct)
        total += 1
        if is_correct:
            correct += 1
        else:
            wrong += 1
        graded.append((q, selected, is_correct))

    earned_points = correct * quiz.points_per_correct
    score_percent = round((correct / total) * 100.0, 2) if total > 0 else 0.0
    today = timezone.localdate()
    yesterday = today - timezone.timedelta(days=1)

    with transaction.atomic():
        att = TestAttempt.objects.create(
            student=student,
            subject=quiz.subject,
            quiz=quiz,
            requested_count=int(b.get('requested_count') or total),
            total_questions=total,
            correct_count=correct,
            wrong_count=wrong,
            earned_points=earned_points,
            duration_sec=max(0, int(b.get('duration_sec') or 0)),
            score_percent=score_percent,
        )
        AttemptAnswer.objects.bulk_create([
            AttemptAnswer(attempt=att, question=q, selected_option=sel, is_correct=ok)
            for q, sel, ok in graded
        ])

        if student.last_active_date == today:
            next_streak = student.streak_days
            next_daily = student.daily_questions_count + total
        elif student.last_active_date == yesterday:
            next_streak = student.streak_days + 1
            next_daily = total
        else:
            next_streak = 1
            next_daily = total

        student.total_points += earned_points
        student.streak_days = next_streak
        student.daily_questions_count = next_daily
        student.last_active_date = today
        student.save()

    return JsonResponse({
        'attempt_id': str(att.id),
        'total_questions': total,
        'correct_count': correct,
        'wrong_count': wrong,
        'earned_points': earned_points,
        'new_total_points': student.total_points,
        'level_name': compute_level_name(student.total_points),
    })


def api_leaderboard(request):
    student_id = request.GET.get('student_id') or ''
    scope = request.GET.get('scope') or 'all'
    me = Student.objects.filter(id=student_id).first() if _is_valid_uuid(student_id) else None

    if scope == 'region' and me:
        qs = Student.objects.filter(region=me.region).order_by('-total_points', '-streak_days')
    elif scope == 'friends' and me:
        friend_ids = Friendship.objects.filter(student=me).values_list('friend_id', flat=True)
        qs = Student.objects.filter(Q(id=me.id) | Q(id__in=friend_ids)).order_by('-total_points', '-streak_days')
    else:
        qs = Student.objects.order_by('-total_points', '-streak_days')

    ranked = []
    for idx, s in enumerate(qs, start=1):
        is_me = str(s.id) == str(student_id)
        if idx <= 50 or is_me:
            ranked.append({
                'rank': idx,
                'id': str(s.id),
                'full_name': s.full_name,
                'region': s.region,
                'total_points': s.total_points,
                'streak_days': s.streak_days,
                'level_name': compute_level_name(s.total_points),
                'is_me': is_me,
            })
    return JsonResponse(ranked, safe=False)


def api_student_history(request, student_id):
    if not _is_valid_uuid(student_id):
        return JsonResponse([], safe=False)
    rows = []
    for att in TestAttempt.objects.select_related('subject', 'quiz').filter(student_id=student_id)[:30]:
        rows.append({
            'attempt_id': str(att.id),
            'subject_name': att.subject.name,
            'quiz_title': att.quiz.title,
            'total_questions': att.total_questions,
            'correct_count': att.correct_count,
            'wrong_count': att.wrong_count,
            'earned_points': att.earned_points,
            'score_percent': att.score_percent,
            'completed_at': _iso(att.completed_at),
        })
    return JsonResponse(rows, safe=False)
