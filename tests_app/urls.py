from django.urls import path, re_path

from . import views_api, views_pages

urlpatterns = [
    # Fullstack HTML Web Admin UI
    path('login/', views_pages.login_view, name='login'),
    path('logout/', views_pages.logout_view, name='logout'),
    path('', views_pages.dashboard_view, name='dashboard'),
    path('subjects/', views_pages.subjects_view, name='subjects'),
    path('tests/', views_pages.tests_view, name='tests'),
    path('tests/<uuid:bank_id>/', views_pages.test_detail_view, name='test_detail'),
    path('students/', views_pages.students_view, name='students'),
    path('results/', views_pages.results_view, name='results'),
    path('results/export/', views_pages.results_export_csv, name='results_export'),

    # Health & Admin JSON APIs (both with & without trailing slash)
    re_path(r'^api/health/?$', views_api.api_health, name='api_health'),
    re_path(r'^api/admin/me/?$', views_api.api_admin_me, name='api_admin_me'),
    re_path(r'^api/admin/login/?$', views_api.api_admin_login, name='api_admin_login'),
    re_path(r'^api/admin/logout/?$', views_api.api_admin_logout, name='api_admin_logout'),
    re_path(r'^api/admin/heartbeat/?$', views_api.api_admin_heartbeat, name='api_admin_heartbeat'),
    re_path(r'^api/admin/overview/?$', views_api.api_admin_overview, name='api_admin_overview'),
    re_path(r'^api/admin/parse-test-file/?$', views_api.api_admin_parse_test_file, name='api_admin_parse_test_file'),
    re_path(r'^api/admin/sample-test/?$', views_api.api_admin_sample_test, name='api_admin_sample_test'),

    re_path(r'^api/admin/subjects/?$', views_api.api_admin_subjects, name='api_admin_subjects'),
    re_path(r'^api/admin/subjects/(?P<subject_id>[^/]+)/?$', views_api.api_admin_subject_detail, name='api_admin_subject_detail'),
    re_path(r'^api/admin/banks/?$', views_api.api_admin_banks, name='api_admin_banks'),
    re_path(r'^api/admin/banks/(?P<bank_id>[^/]+)/?$', views_api.api_admin_bank_detail, name='api_admin_bank_detail'),
    re_path(r'^api/admin/quizzes/?$', views_api.api_admin_quizzes, name='api_admin_quizzes'),
    re_path(r'^api/admin/quizzes/(?P<quiz_id>[^/]+)/?$', views_api.api_admin_quiz_detail, name='api_admin_quiz_detail'),
    re_path(r'^api/admin/questions/?$', views_api.api_admin_questions, name='api_admin_questions'),
    re_path(r'^api/admin/questions/(?P<question_id>[^/]+)/?$', views_api.api_admin_question_detail, name='api_admin_question_detail'),

    # Public Android APK REST APIs (100% compatible with DonoApiClient.kt)
    re_path(r'^api/student/(?:login|upsert)/?$', views_api.api_student_login, name='api_student_login'),
    re_path(r'^api/student/recover/?$', views_api.api_student_recover, name='api_student_recover'),
    re_path(r'^api/student/friends/?$', views_api.api_student_friends, name='api_student_friends'),
    re_path(r'^api/subjects/?$', views_api.api_subjects, name='api_subjects'),
    re_path(r'^api/subjects/(?P<subject_id>[^/]+)/quizzes/?$', views_api.api_subject_quizzes, name='api_subject_quizzes'),
    re_path(r'^api/quizzes/(?P<quiz_id>[^/]+)/questions/?$', views_api.api_quiz_questions, name='api_quiz_questions'),
    re_path(r'^api/attempts/?$', views_api.api_attempts, name='api_attempts'),
    re_path(r'^api/leaderboard/?$', views_api.api_leaderboard, name='api_leaderboard'),
    re_path(r'^api/students/(?P<student_id>[^/]+)/history/?$', views_api.api_student_history, name='api_student_history'),
]
