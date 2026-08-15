# VPS Deployment Guide for Django Certificate System 🚀

This guide explains how to deploy the Django version of the Egyptian Engineering Syndicate Certificate System on a standard Linux VPS (Ubuntu/Debian) using **Nginx** and **Gunicorn**.

---

## Prerequisites
Ensure your VPS has Python 3 installed. Update your packages first:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install python3-pip python3-venv nginx git -y
```

---

## Step 1: Clone and Set Up the Project
1. Clone your repository on the VPS:
   ```bash
   git clone https://github.com/MemaroX/MinyaEngineeringSyndicate-Certs.git /var/www/syndicate-certs
   cd /var/www/syndicate-certs
   ```

2. Create a virtual environment and activate it:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install required packages:
   ```bash
   pip install django requests gunicorn
   ```

4. Run migrations to initialize the database:
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

5. Create your admin superuser account:
   ```bash
   python manage.py createsuperuser
   ```
   *(Enter your desired admin username, email, and password)*

6. Pre-populate your Telegram Credentials:
   Run the Django shell to ensure your bot token and chat ID are initialized:
   ```bash
   python manage.py shell -c "from certificates.models import SyndicateConfiguration; config = SyndicateConfiguration.get_solo(); config.telegram_bot_token = '8670675152:AAHdxkZRtH4jj4E6tC4-vC9W5eCD9jDzXAw'; config.telegram_chat_id = '-5366650527'; config.save(); print('Telegram settings configured!')"
   ```

7. Collect static files:
   ```bash
   python manage.py collectstatic --noinput
   ```

---

## Step 2: Configure Gunicorn (Systemd Service)
Create a systemd service file so Gunicorn runs automatically in the background and restarts on server reboot.

1. Open a new service configuration file:
   ```bash
   sudo nano /etc/systemd/system/gunicorn.service
   ```

2. Paste the following configuration:
   ```ini
   [Unit]
   Description=gunicorn daemon for Syndicate Certs
   After=network.target

   [Service]
   User=root
   WorkingDirectory=/var/www/syndicate-certs
   ExecStart=/var/www/syndicate-certs/venv/bin/gunicorn --workers 3 --bind 127.0.0.1:8000 syndicate_project.wsgi:application
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

3. Start and enable the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl start gunicorn
   sudo systemctl enable gunicorn
   ```

---

## Step 3: Configure Nginx as a Reverse Proxy
Set up Nginx to receive web requests on port 80/443 and forward them to Gunicorn.

1. Open a new Nginx server configuration:
   ```bash
   sudo nano /etc/nginx/sites-available/syndicate
   ```

2. Paste the following configuration (replace `your_domain_or_vps_ip` with your actual domain name or VPS IP address):
   ```nginx
   server {
       listen 80;
       server_name your_domain_or_vps_ip;

       location = /favicon.ico { access_log off; log_not_found off; }
       
       location /static/ {
           root /var/www/syndicate-certs;
       }

       location / {
           include proxy_params;
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Host $http_host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. Enable the Nginx site and restart Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/syndicate /etc/nginx/sites-enabled/
   sudo systemctl restart nginx
   ```

4. Adjust firewall settings to allow web traffic:
   ```bash
   sudo ufw allow 'Nginx Full'
   ```

---

## Step 4: Automate Database Backups to Telegram
Configure a cron job to push backups of the SQLite database directly to your Telegram admin group every hour.

1. Open the cron editor:
   ```bash
   crontab -e
   ```

2. Add the following line at the very bottom:
   ```bash
   0 * * * * cd /var/www/syndicate-certs && /var/www/syndicate-certs/venv/bin/python manage.py backup_to_telegram
   ```

---

## Verification
You can now access your application from any browser:
* **Booking Page:** `http://your_domain_or_vps_ip/`
* **Admin Dashboard:** `http://your_domain_or_vps_ip/dashboard/`
* **Django Native Admin:** `http://your_domain_or_vps_ip/admin_django/`
