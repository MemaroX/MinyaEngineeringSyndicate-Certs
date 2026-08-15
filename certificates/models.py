from django.db import models
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _
import datetime

class SyndicateConfiguration(models.Model):
    monthly_limit_engineer = models.PositiveIntegerField(default=100, verbose_name="حد المهندس العادي الشهري")
    monthly_limit_consultant = models.PositiveIntegerField(default=140, verbose_name="حد المهندس الاستشاري الشهري")
    monthly_limit_concrete_consultant = models.PositiveIntegerField(default=180, verbose_name="حد المهندس الاستشاري خرسانة الشهري")
    monthly_limit_specialized_office = models.PositiveIntegerField(default=250, verbose_name="حد المكتب النوعي الشهري")
    monthly_limit_multi_office = models.PositiveIntegerField(default=450, verbose_name="حد المكتب المتعدد الشهري")
    
    daily_limit_morning = models.PositiveIntegerField(default=150, verbose_name="الحد الأقصى للفترة الصباحية اليومي")
    daily_limit_evening = models.PositiveIntegerField(default=200, verbose_name="الحد الأقصى للفترة المسائية اليومي")
    
    telegram_bot_token = models.CharField(max_length=255, blank=True, default="", verbose_name="توكن بوت تلجرام")
    telegram_chat_id = models.CharField(max_length=255, blank=True, default="", verbose_name="معرف شات تلجرام (المستلم)")

    class Meta:
        verbose_name = "إعدادات النقابة"
        verbose_name_plural = "إعدادات النقابة"

    def __str__(self):
        return "إعدادات حدود النظام العامة"

    @classmethod
    def get_solo(cls):
        obj, created = cls.objects.get_or_create(pk=1)
        return obj


class Application(models.Model):
    CATEGORY_CHOICES = [
        ('engineer', 'مهندس'),
        ('consultant', 'مهندس استشاري'),
        ('consultant_concrete', 'مهندس استشاري تصميم و انشءات خرسانية'),
        ('specialized_office', 'مكتب نوعي'),
        ('multi_office', 'مكتب متعدد'),
    ]

    SLOT_CHOICES = [
        ('morning', 'فترة صباحية'),
        ('evening', 'فترة مسائية'),
    ]

    engineer_name = models.CharField(max_length=255, verbose_name="اسم المهندس")
    registration_num = models.CharField(max_length=50, verbose_name="رقم القيد")
    division = models.CharField(max_length=255, verbose_name="الشعبة الهندسية")
    registry_num = models.CharField(max_length=50, verbose_name="رقم السجل")
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, verbose_name="فئة المهندس")
    certificate_count = models.PositiveIntegerField(verbose_name="عدد الشهادات")
    pickup_date = models.DateField(verbose_name="تاريخ الاستلام")
    pickup_slot = models.CharField(max_length=20, choices=SLOT_CHOICES, verbose_name="الفترة")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاريخ الحجز")

    class Meta:
        ordering = ['created_at'] # FIFO Queue by default
        verbose_name = "طلب استلام شهادة"
        verbose_name_plural = "طلبات استلام الشهادات"

    def __str__(self):
        return f"{self.engineer_name} - {self.pickup_date} ({self.get_pickup_slot_display()})"
