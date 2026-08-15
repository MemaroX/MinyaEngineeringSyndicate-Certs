from django.contrib import admin
from .models import SyndicateConfiguration, Application

@admin.register(SyndicateConfiguration)
class SyndicateConfigurationAdmin(admin.ModelAdmin):
    list_display = ('monthly_limit_engineer', 'monthly_limit_consultant', 'daily_limit_morning', 'daily_limit_evening')
    
    # Restrict creation of more than one instance
    def has_add_permission(self, request):
        if self.model.objects.exists():
            return False
        return super().has_add_permission(request)

@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ('engineer_name', 'registration_num', 'category', 'certificate_count', 'pickup_date', 'pickup_slot', 'created_at')
    list_filter = ('pickup_date', 'pickup_slot', 'category', 'division')
    search_fields = ('engineer_name', 'registration_num', 'registry_num')
    date_hierarchy = 'pickup_date'
    ordering = ('-created_at',)
