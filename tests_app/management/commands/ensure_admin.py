from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Create default DONO admin superuser if none exists (keeps database clean of demo data).'

    def handle(self, *args, **options):
        User = get_user_model()
        username = getattr(settings, 'DEFAULT_ADMIN_USERNAME', 'admin')
        password = getattr(settings, 'DEFAULT_ADMIN_PASSWORD', 'admin123')
        if User.objects.filter(username=username).exists():
            self.stdout.write(self.style.SUCCESS(f'Admin "{username}" allaqachon mavjud.'))
            return
        User.objects.create_superuser(
            username=username,
            email=f'{username}@example.com',
            password=password,
            first_name='Bosh Admin',
        )
        self.stdout.write(self.style.SUCCESS(f'Standart admin yaratildi: {username} / {password}'))
