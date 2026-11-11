from django.contrib import admin
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


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'sort_order', 'is_active', 'created_at')
    search_fields = ('name',)


@admin.register(QuestionBank)
class QuestionBankAdmin(admin.ModelAdmin):
    list_display = ('title', 'subject', 'source_type', 'created_at')
    list_filter = ('subject', 'source_type')
    search_fields = ('title', 'subject_hint')


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ('title', 'subject', 'time_per_question_sec', 'points_per_correct', 'is_active')
    list_filter = ('subject', 'is_active')
    filter_horizontal = ('banks',)


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ('short_question', 'bank', 'correct_option', 'created_at')
    list_filter = ('bank', 'correct_option')
    search_fields = ('question_text', 'option_a', 'option_b', 'option_c', 'option_d')

    @admin.display(description='Savol')
    def short_question(self, obj):
        return obj.question_text[:70]


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'phone', 'total_points', 'streak_days', 'last_active_date')
    search_fields = ('full_name', 'phone', 'recovery_code')


@admin.register(TestAttempt)
class TestAttemptAdmin(admin.ModelAdmin):
    list_display = ('student', 'subject', 'quiz', 'correct_count', 'total_questions', 'score_percent', 'completed_at')
    list_filter = ('subject', 'quiz')


admin.site.register(Friendship)
admin.site.register(AttemptAnswer)
