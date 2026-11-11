from django.apps import AppConfig
from django.db.backends.signals import connection_created
from django.db.models.signals import post_migrate


def configure_sqlite(sender, connection, **kwargs):
    if connection.vendor == 'sqlite':
        with connection.cursor() as cursor:
            cursor.execute('PRAGMA foreign_keys = ON;')
            cursor.execute('PRAGMA busy_timeout = 10000;')


def auto_create_admin(sender, **kwargs):
    from django.conf import settings
    from django.contrib.auth import get_user_model

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


class TestsAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'tests_app'
    verbose_name = 'DONO Test Platformasi'

    def ready(self):
        connection_created.connect(configure_sqlite)
        post_migrate.connect(auto_create_admin, sender=self)
