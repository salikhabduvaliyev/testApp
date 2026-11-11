import csv
import json
from functools import wraps

from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.db import transaction
from django.db.models import Avg, Count, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from .models import Question, QuestionBank, Quiz, Student, Subject, TestAttempt
from .utils import compute_level_name, format_uz_phone
from .views_api import _compute_heartbeat_payload, _is_valid_uuid, ensure_default_admin_lazy


def admin_required(view_fn):
    @wraps(view_fn)
    def _wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated or not request.user.is_staff:
            return redirect(f'/login/?next={request.path}')
        return view_fn(request, *args, **kwargs)

    return _wrapped


def _base_ctx(request, active_nav: str) -> dict:
    return {
        'active_nav': active_nav,
        'admin_username': request.user.username if request.user.is_authenticated else '',
        'heartbeat_version': _compute_heartbeat_payload()['version'],
    }


def login_view(request):
    ensure_default_admin_lazy()
    if request.user.is_authenticated and request.user.is_staff:
        return redirect('dashboard')

    error = None
    username_val = ''
    if request.method == 'POST':
        username_val = str(request.POST.get('username') or '').strip()
        password = str(request.POST.get('password') or '')
        user = authenticate(request, username=username_val, password=password)
        if user is not None and user.is_staff:
            login(request, user)
            nxt = request.GET.get('next') or request.POST.get('next') or '/'
            if not str(nxt).startswith('/'):
                nxt = '/'
            return redirect(nxt)
        error = 'Login yoki parol noto‘g‘ri.'

    return render(request, 'login.html', {'error': error, 'username_val': username_val})


def logout_view(request):
    logout(request)
    return redirect('login')


@admin_required
def dashboard_view(request):
    today = timezone.localdate()
    avg_score = TestAttempt.objects.aggregate(avg=Avg('score_percent'))['avg'] or 0.0
    stats = {
        'total_students': Student.objects.count(),
        'active_today': Student.objects.filter(last_active_date=today).count(),
        'total_attempts': TestAttempt.objects.count(),
        'avg_score_percent': round(float(avg_score)),
        'total_subjects': Subject.objects.count(),
        'total_banks': QuestionBank.objects.count(),
        'total_questions': Question.objects.count(),
    }
    recent_attempts = TestAttempt.objects.select_related('student', 'subject', 'quiz')[:15]
    ctx = {
        **_base_ctx(request, 'dashboard'),
        'stats': stats,
        'recent_attempts': recent_attempts,
    }
    return render(request, 'dashboard.html', ctx)


@admin_required
def subjects_view(request):
    if request.method == 'POST':
        action = request.POST.get('action') or ''
        if action == 'save_subject':
            sub_id = (request.POST.get('subject_id') or '').strip()
            name = (request.POST.get('name') or '').strip()
            desc = (request.POST.get('description') or '').strip()
            color = (request.POST.get('color_hex') or '#2563EB').strip()
            icon = (request.POST.get('icon_key') or 'menu_book').strip()
            if name:
                if sub_id:
                    sub = get_object_or_404(Subject, id=sub_id)
                    sub.name = name
                    sub.description = desc
                    sub.color_hex = color
                    sub.icon_key = icon
                    sub.save()
                    messages.success(request, f'"{name}" fani yangilandi.')
                    return redirect(f'/subjects/?subject={sub.id}')
                else:
                    sub = Subject.objects.create(
                        name=name,
                        description=desc,
                        color_hex=color,
                        icon_key=icon,
                        sort_order=Subject.objects.count() + 1,
                    )
                    messages.success(request, f'"{name}" fani yaratildi.')
                    return redirect(f'/subjects/?subject={sub.id}')
        elif action == 'delete_subject':
            sub_id = (request.POST.get('subject_id') or '').strip()
            if sub_id:
                sub = get_object_or_404(Subject, id=sub_id)
                sub_name = sub.name
                sub.delete()
                messages.success(request, f'"{sub_name}" fani o‘chirildi.')
            return redirect('subjects')
        elif action == 'save_quiz':
            quiz_id = (request.POST.get('quiz_id') or '').strip()
            subject_id = (request.POST.get('subject_id') or '').strip()
            title = (request.POST.get('title') or '').strip()
            desc = (request.POST.get('description') or '').strip()
            raw_t = request.POST.get('time_per_question_sec')
            raw_p = request.POST.get('points_per_correct')
            time_sec = max(0, int(raw_t)) if raw_t not in (None, '') else 20
            points = max(1, int(raw_p)) if raw_p not in (None, '') else 5
            bank_ids = [x for x in request.POST.getlist('bank_ids') if _is_valid_uuid(x)]
            if not _is_valid_uuid(subject_id):
                messages.error(request, 'Fan topilmadi.')
                return redirect('subjects')
            sub = get_object_or_404(Subject, id=subject_id)
            if not title or not bank_ids:
                messages.error(request, 'Test to‘plami nomi va kamida bitta test tanlanishi shart.')
                return redirect(f'/subjects/?subject={sub.id}')
            with transaction.atomic():
                if quiz_id:
                    qz = get_object_or_404(Quiz, id=quiz_id)
                    qz.title = title
                    qz.description = desc
                    qz.time_per_question_sec = time_sec
                    qz.points_per_correct = points
                    qz.save()
                    messages.success(request, f'"{title}" to‘plami yangilandi.')
                else:
                    qz = Quiz.objects.create(
                        subject=sub,
                        title=title,
                        description=desc,
                        time_per_question_sec=time_sec,
                        points_per_correct=points,
                    )
                    messages.success(request, f'"{title}" to‘plami yaratildi.')
                qz.banks.set(QuestionBank.objects.filter(id__in=bank_ids))
            return redirect(f'/subjects/?subject={sub.id}')
        elif action == 'delete_quiz':
            quiz_id = (request.POST.get('quiz_id') or '').strip()
            subject_id = (request.POST.get('subject_id') or '').strip()
            if quiz_id:
                qz = get_object_or_404(Quiz, id=quiz_id)
                qz.delete()
                messages.success(request, 'Test to‘plami o‘chirildi.')
            return redirect(f'/subjects/?subject={subject_id}' if subject_id else 'subjects')

    subjects = list(Subject.objects.annotate(quiz_count=Count('quizzes', distinct=True)))
    selected_id = (request.GET.get('subject') or '').strip()
    active_subject = next((s for s in subjects if str(s.id) == selected_id), None)
    if active_subject is None and subjects:
        active_subject = subjects[0]

    subject_quizzes = []
    if active_subject:
        for qz in (
            Quiz.objects.filter(subject=active_subject)
            .prefetch_related('banks')
            .annotate(question_count=Count('banks__questions', distinct=True))
        ):
            bank_list = list(qz.banks.all())
            subject_quizzes.append({
                'obj': qz,
                'question_count': qz.question_count,
                'bank_ids_json': json.dumps([str(b.id) for b in bank_list]),
                'first_bank_id': str(bank_list[0].id) if bank_list else '',
            })

    all_banks = list(
        QuestionBank.objects.select_related('subject').annotate(question_count=Count('questions', distinct=True))
    )
    if active_subject:
        all_banks.sort(key=lambda b: (0 if b.subject_id == active_subject.id else 1, -b.created_at.timestamp()))

    color_options = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DC2626', '#0891B2']
    icon_options = [
        ('calculate', 'Matematika'),
        ('language', 'Xorijiy til'),
        ('menu_book', 'Ona tili / Adabiyot'),
        ('translate', 'Tarjima / Rus tili'),
        ('science', 'Kimyo / Biologiya'),
        ('history_edu', 'Tarix'),
        ('code', 'Informatika'),
        ('public', 'Geografiya'),
    ]

    ctx = {
        **_base_ctx(request, 'subjects'),
        'subjects': subjects,
        'active_subject': active_subject,
        'subject_quizzes': subject_quizzes,
        'all_banks': all_banks,
        'color_options': color_options,
        'icon_options': icon_options,
    }
    return render(request, 'subjects.html', ctx)


SOURCE_LABELS = {
    'docx': 'Word (.docx)',
    'doc': 'Word (.doc)',
    'pdf': 'PDF (.pdf)',
    'txt': 'Matn (.txt)',
    'xlsx': 'Excel (.xlsx)',
    'xls': 'Excel (.xls)',
    'csv': 'CSV',
    'json': 'JSON',
}


@admin_required
def tests_view(request):
    if request.method == 'POST':
        action = request.POST.get('action') or ''
        if action == 'edit_bank':
            bank = get_object_or_404(QuestionBank, id=request.POST.get('bank_id'))
            title = (request.POST.get('title') or '').strip()
            sub_id = (request.POST.get('subject_id') or '').strip()
            desc = (request.POST.get('description') or '').strip()
            if title:
                bank.title = title
                bank.description = desc
                sub = Subject.objects.filter(id=sub_id).first() if _is_valid_uuid(sub_id) else None
                bank.subject = sub
                bank.subject_hint = sub.name if sub else ''
                bank.save()
                messages.success(request, f'"{title}" ma’lumotlari saqlandi.')
            return redirect('tests')
        elif action == 'delete_bank':
            bank = get_object_or_404(QuestionBank, id=request.POST.get('bank_id'))
            t = bank.title
            bank.delete()
            messages.success(request, f'"{t}" testi o‘chirildi.')
            return redirect('tests')

    q = (request.GET.get('q') or '').strip()
    sub_filter = (request.GET.get('subject') or 'ALL').strip()

    banks_qs = QuestionBank.objects.select_related('subject').annotate(
        question_count=Count('questions', distinct=True),
        linked_quiz_count=Count('quizzes', distinct=True),
    )
    if sub_filter == 'NONE':
        banks_qs = banks_qs.filter(subject__isnull=True)
    elif sub_filter != 'ALL':
        if _is_valid_uuid(sub_filter):
            banks_qs = banks_qs.filter(subject_id=sub_filter)
        else:
            banks_qs = banks_qs.none()

    if q:
        banks_qs = banks_qs.filter(
            Q(title__icontains=q) | Q(subject__name__icontains=q) | Q(description__icontains=q)
        )

    banks_list = []
    for idx, b in enumerate(banks_qs, start=1):
        banks_list.append({
            'num': idx,
            'obj': b,
            'source_label': SOURCE_LABELS.get(b.source_type, b.source_type.upper()) if b.source_type else '',
            'sub_name': b.subject.name if b.subject else b.subject_hint,
            'sub_color': b.subject.color_hex if b.subject else '#64748B',
        })

    ctx = {
        **_base_ctx(request, 'tests'),
        'subjects': Subject.objects.all(),
        'banks': banks_list,
        'total_banks': QuestionBank.objects.count(),
        'search_query': q,
        'subject_filter': sub_filter,
        'open_upload': request.GET.get('upload') == '1',
    }
    return render(request, 'tests.html', ctx)


@admin_required
def test_detail_view(request, bank_id):
    bank = get_object_or_404(QuestionBank.objects.select_related('subject'), id=bank_id)

    if request.method == 'POST':
        action = request.POST.get('action') or ''
        if action == 'save_question':
            qid = (request.POST.get('question_id') or '').strip()
            q_text = (request.POST.get('question_text') or '').strip()
            expr = (request.POST.get('expression_text') or '').strip() or None
            opt_a = (request.POST.get('option_a') or '').strip()
            opt_b = (request.POST.get('option_b') or '').strip()
            opt_c = (request.POST.get('option_c') or '').strip()
            opt_d = (request.POST.get('option_d') or '').strip()
            correct = (request.POST.get('correct_option') or 'A').strip().upper()
            explanation = (request.POST.get('explanation') or '').strip()
            if q_text and opt_a and opt_b and opt_c and opt_d and correct in ('A', 'B', 'C', 'D'):
                if qid:
                    item = get_object_or_404(Question, id=qid, bank=bank)
                    item.question_text = q_text
                    item.expression_text = expr
                    item.option_a = opt_a
                    item.option_b = opt_b
                    item.option_c = opt_c
                    item.option_d = opt_d
                    item.correct_option = correct
                    item.explanation = explanation
                    item.save()
                    messages.success(request, 'Savol tahrirlandi.')
                else:
                    Question.objects.create(
                        bank=bank,
                        question_text=q_text,
                        expression_text=expr,
                        option_a=opt_a,
                        option_b=opt_b,
                        option_c=opt_c,
                        option_d=opt_d,
                        correct_option=correct,
                        explanation=explanation,
                    )
                    messages.success(request, 'Yangi savol qo‘shildi.')
            return redirect('test_detail', bank_id=bank.id)
        elif action == 'delete_question':
            qid = (request.POST.get('question_id') or '').strip()
            item = get_object_or_404(Question, id=qid, bank=bank)
            item.delete()
            messages.success(request, 'Savol o‘chirildi.')
            return redirect('test_detail', bank_id=bank.id)

    search_q = (request.GET.get('q') or '').strip()
    qs = bank.questions.all()
    if search_q:
        qs = qs.filter(
            Q(question_text__icontains=search_q)
            | Q(expression_text__icontains=search_q)
            | Q(option_a__icontains=search_q)
            | Q(option_b__icontains=search_q)
            | Q(option_c__icontains=search_q)
            | Q(option_d__icontains=search_q)
        )

    ctx = {
        **_base_ctx(request, 'tests'),
        'bank': bank,
        'questions': qs,
        'total_count': bank.questions.count(),
        'search_query': search_q,
    }
    return render(request, 'test_detail.html', ctx)


@admin_required
def students_view(request):
    if request.method == 'POST' and request.POST.get('action') == 'delete_student':
        st = get_object_or_404(Student, id=request.POST.get('student_id'))
        name = st.full_name
        st.delete()
        messages.success(request, f'"{name}" o‘chirildi.')
        return redirect('students')

    search_q = (request.GET.get('q') or '').strip()
    qs = Student.objects.annotate(
        attempt_count=Count('attempts', distinct=True),
        avg_percent=Avg('attempts__score_percent'),
    )
    if search_q:
        qs = qs.filter(
            Q(full_name__icontains=search_q)
            | Q(phone__icontains=search_q)
            | Q(recovery_code__icontains=search_q)
        )

    students = []
    for st in qs:
        students.append({
            'obj': st,
            'phone_display': format_uz_phone(st.phone),
            'level_name': compute_level_name(st.total_points),
            'avg_percent': round(float(st.avg_percent or 0)),
        })

    ctx = {
        **_base_ctx(request, 'students'),
        'students': students,
        'search_query': search_q,
    }
    return render(request, 'students.html', ctx)


@admin_required
def results_view(request):
    search_q = (request.GET.get('q') or '').strip()
    sub_filter = (request.GET.get('subject') or 'ALL').strip()

    qs = TestAttempt.objects.select_related('student', 'subject', 'quiz')
    if sub_filter != 'ALL':
        if _is_valid_uuid(sub_filter):
            qs = qs.filter(subject_id=sub_filter)
        else:
            qs = qs.none()
    if search_q:
        qs = qs.filter(
            Q(student__full_name__icontains=search_q)
            | Q(student__phone__icontains=search_q)
            | Q(subject__name__icontains=search_q)
            | Q(quiz__title__icontains=search_q)
        )

    ctx = {
        **_base_ctx(request, 'results'),
        'attempts': qs[:200],
        'subjects': Subject.objects.all(),
        'search_query': search_q,
        'subject_filter': sub_filter,
    }
    return render(request, 'results.html', ctx)


@admin_required
def results_export_csv(request):
    sub_filter = (request.GET.get('subject') or 'ALL').strip()
    search_q = (request.GET.get('q') or '').strip()

    qs = TestAttempt.objects.select_related('student', 'subject', 'quiz')
    if sub_filter != 'ALL':
        if _is_valid_uuid(sub_filter):
            qs = qs.filter(subject_id=sub_filter)
        else:
            qs = qs.none()
    if search_q:
        qs = qs.filter(
            Q(student__full_name__icontains=search_q)
            | Q(student__phone__icontains=search_q)
            | Q(subject__name__icontains=search_q)
            | Q(quiz__title__icontains=search_q)
        )

    resp = HttpResponse(content_type='text/csv; charset=utf-8')
    resp['Content-Disposition'] = 'attachment; filename="dono-natijalar.csv"'
    resp.write('\ufeff')  # UTF-8 BOM for Microsoft Excel
    writer = csv.writer(resp)
    writer.writerow(['F.I.O', 'Telefon raqami', 'Fan', 'Test', 'To‘g‘ri', 'Jami savol', 'Foiz', 'Ochko', 'Vaqt'])
    for row in qs[:1000]:
        local_dt = timezone.localtime(row.completed_at).strftime('%d.%m.%Y %H:%M')
        writer.writerow([
            row.student.full_name,
            row.student.phone,
            row.subject.name,
            row.quiz.title,
            row.correct_count,
            row.total_questions,
            f'{round(row.score_percent)}%',
            row.earned_points,
            local_dt,
        ])
    return resp
