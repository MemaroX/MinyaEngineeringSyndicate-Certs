import os
import requests
from django.core.management.base import BaseCommand
from django.conf import settings
from django.utils import timezone
from certificates.models import SyndicateConfiguration

class Command(BaseCommand):
    help = "Backs up the SQLite database and sends it directly to the Admin via Telegram"

    def handle(self, *args, **options):
        # 1. Retrieve configurations
        config = SyndicateConfiguration.get_solo()
        token = config.telegram_bot_token
        chat_id = config.telegram_chat_id

        if not token or not chat_id:
            self.stdout.write(self.style.ERROR("Error: Telegram bot token or chat ID is not configured in the settings!"))
            return

        # 2. Get SQLite database file path
        db_path = settings.DATABASES['default']['NAME']
        if not os.path.exists(db_path):
            self.stdout.write(self.style.ERROR(f"Error: Database file not found at {db_path}"))
            return

        self.stdout.write(f"Initiating database backup for {db_path}...")

        # 3. Send file to Telegram
        url = f"https://api.telegram.org/bot{token}/sendDocument"
        timestamp = timezone.localtime(timezone.now()).strftime("%Y-%m-%d_%H-%M-%S")
        filename = f"syndicate_db_backup_{timestamp}.sqlite3"

        try:
            with open(db_path, 'rb') as db_file:
                files = {
                    'document': (filename, db_file, 'application/x-sqlite3')
                }
                data = {
                    'chat_id': chat_id,
                    'caption': f"📦 *نسخة احتياطية لقاعدة البيانات*\n📅 تاريخ النسخ: {timezone.localtime(timezone.now()).strftime('%Y-%m-%d %I:%M %p')}\n🌐 اسم الملف: `{filename}`",
                    'parse_mode': 'Markdown'
                }
                
                response = requests.post(url, data=data, files=files, timeout=30)
                
                if response.status_code == 200:
                    self.stdout.write(self.style.SUCCESS(f"Success: Backup sent successfully to Telegram as '{filename}'!"))
                else:
                    self.stdout.write(self.style.ERROR(f"Failed: Telegram returned status code {response.status_code}. Response: {response.text}"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Failed: An error occurred during backup: {str(e)}"))
