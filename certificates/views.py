from django.shortcuts import render, redirect
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.db.models import Sum
from django.utils import timezone
import json
import datetime
import requests
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required

from .models import SyndicateConfiguration, Application

def apply_view(request):
    """
    Renders the main application form for engineers.
    """
    config = SyndicateConfiguration.get_solo()
    # Pass configuration settings to templates for dynamic JS client limits
    context = {
        'config': config
    }
    return render(request, 'certificates/index.html', context)


@csrf_exempt
def submit_application_api(request):
    """
    API endpoint to validate and submit a certificate application.
    """
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'طلب غير صالح.'}, status=400)
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'بيانات JSON غير صالحة.'}, status=400)
    
    # 1. Basic extraction
    name = data.get('engineer_name', '').strip()
    reg_num = data.get('registration_num', '').strip()
    division = data.get('division', '').strip()
    registry_num = data.get('registry_num', '').strip()
    category = data.get('category', '').strip()
    cert_count = int(data.get('certificate_count', 1))
    
    pickup_date_str = data.get('pickup_date', '')
    pickup_slot = data.get('pickup_slot', '')

    # 2. Basic validations
    if not (name and reg_num and division and registry_num and category and pickup_date_str and pickup_slot):
        return JsonResponse({'success': False, 'error': 'جميع الحقول المميزة بنجمة مطلوبة.'}, status=400)

    if cert_count < 1 or cert_count > 20:
        return JsonResponse({'success': False, 'error': 'عدد الشهادات يجب أن يكون بين 1 و 20.'}, status=400)

    # Parse date
    try:
        pickup_date = datetime.datetime.strptime(pickup_date_str, "%Y-%m-%d").date()
    except ValueError:
        return JsonResponse({'success': False, 'error': 'تنسيق التاريخ غير صحيح.'}, status=400)

    # Anchored system base date/time (2026-08-15 18:23:05 local time)
    # We simulate timezone-aware current time for rules checks
    now_local = datetime.datetime(2026, 8, 15, 18, 23, 5) 
    today_local = now_local.date()

    # Rule checks:
    # A. Past dates
    if pickup_date < today_local:
        return JsonResponse({'success': False, 'error': 'لا يمكن حجز موعد في الماضي.'}, status=400)

    # B. Weekend validation (Thursday=3, Friday=4 in Python's weekday() if Monday=0, wait!)
    # Python weekday(): Monday is 0, Tuesday is 1, Wednesday is 2, Thursday is 3, Friday is 4, Saturday is 5, Sunday is 6.
    # Thursday: 3, Friday: 4.
    if pickup_date.weekday() in [3, 4]:
        return JsonResponse({'success': False, 'error': 'يومي الخميس والجمعة عطلة رسمية بالنقابة.'}, status=400)

    # C. Same day limits based on time
    if pickup_date == today_local:
        current_hour = now_local.hour
        if pickup_slot == 'morning' and current_hour >= 9:
            return JsonResponse({'success': False, 'error': 'عذراً، انتهى وقت التقديم للفترة الصباحية لهذا اليوم (الساعة 9:00 ص).'}, status=400)
        if pickup_slot == 'evening' and current_hour >= 17:
            return JsonResponse({'success': False, 'error': 'عذراً، انتهى وقت التقديم للفترة المسائية لهذا اليوم (الساعة 5:00 م).'}, status=400)

    config = SyndicateConfiguration.get_solo()

    # D. Single-booking per day rule (cannot apply for both slots on the same day)
    existing_today_booking = Application.objects.filter(
        registration_num=reg_num,
        pickup_date=pickup_date
    ).exists()
    if existing_today_booking:
        return JsonResponse({'success': False, 'error': 'عذراً، لا يمكنك حجز أكثر من فترة في نفس اليوم.'}, status=400)

    # E. Daily shift limits (total capacity across all engineers)
    total_slot_certs = Application.objects.filter(
        pickup_date=pickup_date,
        pickup_slot=pickup_slot
    ).aggregate(total=Sum('certificate_count'))['total'] or 0
    
    slot_limit = config.daily_limit_morning if pickup_slot == 'morning' else config.daily_limit_evening
    if total_slot_certs + cert_count > slot_limit:
        remaining = max(0, slot_limit - total_slot_certs)
        return JsonResponse({
            'success': False, 
            'error': f'عذراً، تم تجاوز السعة الاستيعابية لهذه الفترة اليوم. المتبقي متاح: {remaining} شهادة.'
        }, status=400)

    # F. Monthly limit by category
    # Sum certificates for current engineer in this month (of the pickup_date)
    start_of_month = datetime.date(pickup_date.year, pickup_date.month, 1)
    if pickup_date.month == 12:
        end_of_month = datetime.date(pickup_date.year + 1, 1, 1) - datetime.timedelta(days=1)
    else:
        end_of_month = datetime.date(pickup_date.year, pickup_date.month + 1, 1) - datetime.timedelta(days=1)

    monthly_certs_sum = Application.objects.filter(
        registration_num=reg_num,
        pickup_date__range=[start_of_month, end_of_month]
    ).aggregate(total=Sum('certificate_count'))['total'] or 0

    category_limits = {
        'engineer': config.monthly_limit_engineer,
        'consultant': config.monthly_limit_consultant,
        'consultant_concrete': config.monthly_limit_concrete_consultant,
        'specialized_office': config.monthly_limit_specialized_office,
        'multi_office': config.monthly_limit_multi_office,
    }
    
    user_limit = category_limits.get(category, 100)
    if monthly_certs_sum + cert_count > user_limit:
        remaining_monthly = max(0, user_limit - monthly_certs_sum)
        return JsonResponse({
            'success': False,
            'error': f'عذراً، لقد تجاوزت الحد الأقصى للشهادات المسموح بها لفئتك هذا الشهر. المتبقي لك: {remaining_monthly} شهادة.'
        }, status=400)

    # 3. Create application
    application = Application.objects.create(
        engineer_name=name,
        registration_num=reg_num,
        division=division,
        registry_num=registry_num,
        category=category,
        certificate_count=cert_count,
        pickup_date=pickup_date,
        pickup_slot=pickup_slot
    )

    # 4. Queue Position
    queue_pos = Application.objects.filter(
        pickup_date=pickup_date,
        pickup_slot=pickup_slot,
        created_at__lte=application.created_at
    ).count()

    # 5. Send Telegram Bot Report
    total_after = monthly_certs_sum + cert_count
    send_telegram_alert(application, total_after, user_limit, queue_pos)

    # 6. Response
    return JsonResponse({
        'success': True,
        'data': {
            'id': application.id,
            'name': application.engineer_name,
            'reg_num': application.registration_num,
            'division': application.division,
            'certs': application.certificate_count,
            'date': application.pickup_date.strftime("%Y-%m-%d"),
            'slot': application.get_pickup_slot_display(),
            'queue_pos': queue_pos
        }
    })


def send_telegram_alert(app, monthly_total, monthly_limit, queue_pos):
    """
    Sends a structured notification to the admin via Telegram Bot API.
    """
    config = SyndicateConfiguration.get_solo()
    if not config.telegram_bot_token or not config.telegram_chat_id:
        return False
    
    url = f"https://api.telegram.org/bot{config.telegram_bot_token}/sendMessage"
    
    # Formatted Markdown message
    msg = (
        f"🏛️ *طلب حجز شهادات جديد - نقابة المهندسين*\n\n"
        f"👤 *المهندس:* {app.engineer_name}\n"
        f"🔢 *رقم القيد:* {app.registration_num}\n"
        f"📂 *الشعبة:* {app.division}\n"
        f"💼 *الفئة:* {app.get_category_display()}\n"
        f"📄 *عدد الشهادات المطلوبة:* {app.certificate_count} شهادة\n"
        f"📅 *تاريخ الاستلام:* {app.pickup_date.strftime('%Y-%m-%d')}\n"
        f"⏰ *الفترة:* {app.get_pickup_slot_display()}\n\n"
        f"📊 *إحصائيات الشهر للمهندس ({app.pickup_date.strftime('%m/%Y')}):*\n"
        f"├ إجمالي الحجوزات: {monthly_total} / {monthly_limit} شهادة\n"
        f"└ المتبقي المتاح: {max(0, monthly_limit - monthly_total)} شهادة\n\n"
        f"⏱️ *ترتيب الحجز في طابور الفترة:* {queue_pos} (الأسبق فالأسبق)."
    )
    
    payload = {
        'chat_id': config.telegram_chat_id,
        'text': msg,
        'parse_mode': 'Markdown'
    }
    
    try:
        response = requests.post(url, json=payload, timeout=5)
        return response.status_code == 200
    except Exception:
        return False


@login_required(login_url='login')
def admin_dashboard(request):
    """
    Stunning dashboard for admins to manage configuration settings, limits, and view day-by-day queues.
    """
    config = SyndicateConfiguration.get_solo()
    
    if request.method == 'POST':
        # Update settings
        config.monthly_limit_engineer = int(request.POST.get('limit_engineer', 100))
        config.monthly_limit_consultant = int(request.POST.get('limit_consultant', 140))
        config.monthly_limit_concrete_consultant = int(request.POST.get('limit_concrete_consultant', 180))
        config.monthly_limit_specialized_office = int(request.POST.get('limit_specialized_office', 250))
        config.monthly_limit_multi_office = int(request.POST.get('limit_multi_office', 450))
        
        config.daily_limit_morning = int(request.POST.get('limit_morning', 150))
        config.daily_limit_evening = int(request.POST.get('limit_evening', 200))
        
        config.telegram_bot_token = request.POST.get('telegram_token', '').strip()
        config.telegram_chat_id = request.POST.get('telegram_chat_id', '').strip()
        
        config.save()
        return redirect('admin_dashboard')

    # Date filter: default to future dates from today (2026-08-15)
    today = datetime.date(2026, 8, 15)
    date_filter_str = request.GET.get('date', '')
    
    if date_filter_str:
        try:
            target_date = datetime.datetime.strptime(date_filter_str, "%Y-%m-%d").date()
        except ValueError:
            target_date = today
    else:
        target_date = today

    # Get applications for selected date sorted by created_at (FIFO Queue)
    morning_queue = Application.objects.filter(
        pickup_date=target_date,
        pickup_slot='morning'
    ).order_by('created_at')
    
    evening_queue = Application.objects.filter(
        pickup_date=target_date,
        pickup_slot='evening'
    ).order_by('created_at')

    # Totals
    morning_certs_total = morning_queue.aggregate(total=Sum('certificate_count'))['total'] or 0
    evening_certs_total = evening_queue.aggregate(total=Sum('certificate_count'))['total'] or 0

    context = {
        'config': config,
        'target_date': target_date.strftime("%Y-%m-%d"),
        'target_date_formatted': target_date.strftime("%Y-%m-%d"),
        'morning_queue': morning_queue,
        'evening_queue': evening_queue,
        'morning_certs_total': morning_certs_total,
        'evening_certs_total': evening_certs_total,
        'morning_certs_left': max(0, config.daily_limit_morning - morning_certs_total),
        'evening_certs_left': max(0, config.daily_limit_evening - evening_certs_total),
    }
    return render(request, 'certificates/dashboard.html', context)


def login_view(request):
    if request.user.is_authenticated:
        return redirect('admin_dashboard')
    
    error = None
    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        password = request.POST.get('password', '').strip()
        
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect('admin_dashboard')
        else:
            error = "اسم المستخدم أو كلمة المرور غير صحيحة."
            
    return render(request, 'certificates/login.html', {'error': error})


def logout_view(request):
    logout(request)
    return redirect('login')
