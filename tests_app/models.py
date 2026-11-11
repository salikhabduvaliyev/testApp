import uuid
from django.db import models
from django.utils import timezone


class Subject(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    icon_key = models.CharField(max_length=50, default='menu_book')
    color_hex = models.CharField(max_length=20, default='#2563EB')
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'created_at']
        verbose_name = 'Fan'
        verbose_name_plural = 'Fanlar'

    def __str__(self):
        return self.name


class QuestionBank(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    subject = models.ForeignKey(
        Subject,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='banks',
    )
    subject_hint = models.CharField(max_length=200, blank=True, default='')
    source_type = models.CharField(max_length=20, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Test'
        verbose_name_plural = 'Testlar'

    def __str__(self):
        return self.title


class Quiz(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='quizzes')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    time_per_question_sec = models.IntegerField(default=20)
    points_per_correct = models.IntegerField(default=5)
    is_active = models.BooleanField(default=True)
    banks = models.ManyToManyField(QuestionBank, blank=True, related_name='quizzes')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        verbose_name = 'Test to‘plami'
        verbose_name_plural = 'Test to‘plamlari'

    def __str__(self):
        return f'{self.subject.name}: {self.title}'


class Question(models.Model):
    CORRECT_CHOICES = [('A', 'A'), ('B', 'B'), ('C', 'C'), ('D', 'D')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bank = models.ForeignKey(QuestionBank, on_delete=models.CASCADE, related_name='questions')
    legacy_quiz_id = models.UUIDField(null=True, blank=True)
    question_text = models.TextField()
    expression_text = models.TextField(null=True, blank=True)
    option_a = models.TextField()
    option_b = models.TextField()
    option_c = models.TextField()
    option_d = models.TextField()
    correct_option = models.CharField(max_length=1, choices=CORRECT_CHOICES)
    explanation = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        verbose_name = 'Savol'
        verbose_name_plural = 'Savollar'

    def __str__(self):
        return self.question_text[:60]


class Student(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone = models.CharField(max_length=32, unique=True)
    full_name = models.CharField(max_length=255)
    first_name = models.CharField(max_length=120, blank=True, default='')
    last_name = models.CharField(max_length=120, blank=True, default='')
    device_id = models.CharField(max_length=255, blank=True, default='')
    recovery_code = models.CharField(max_length=16, unique=True)
    region = models.CharField(max_length=120, default='O‘zbekiston')
    total_points = models.IntegerField(default=0)
    streak_days = models.IntegerField(default=1)
    daily_questions_count = models.IntegerField(default=0)
    daily_goal_target = models.IntegerField(default=10)
    last_active_date = models.DateField(default=timezone.localdate)
    last_active_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['phone', '-total_points']
        verbose_name = 'Foydalanuvchi'
        verbose_name_plural = 'Foydalanuvchilar'

    def __str__(self):
        return f'{self.full_name} ({self.phone})'


class Friendship(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='friendships')
    friend = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='friended_by')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('student', 'friend')]


class TestAttempt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='attempts')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='attempts')
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name='attempts')
    requested_count = models.IntegerField()
    total_questions = models.IntegerField()
    correct_count = models.IntegerField()
    wrong_count = models.IntegerField()
    earned_points = models.IntegerField()
    duration_sec = models.IntegerField(default=0)
    score_percent = models.FloatField(default=0.0)
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-completed_at']
        verbose_name = 'Test natijasi'
        verbose_name_plural = 'Test natijalari'


class AttemptAnswer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    attempt = models.ForeignKey(TestAttempt, on_delete=models.CASCADE, related_name='answers')
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='attempt_answers')
    selected_option = models.CharField(max_length=1, null=True, blank=True)
    is_correct = models.BooleanField(default=False)
