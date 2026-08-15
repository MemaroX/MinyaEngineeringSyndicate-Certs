from django.urls import path
from . import views

urlpatterns = [
    path('', views.apply_view, name='apply_view'),
    path('apply/submit/', views.submit_application_api, name='submit_application'),
    path('dashboard/', views.admin_dashboard, name='admin_dashboard'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
]
