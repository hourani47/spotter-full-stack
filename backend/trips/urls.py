from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health),
    path("locations/", views.locations),
    path("trips/plan/", views.plan),
]
