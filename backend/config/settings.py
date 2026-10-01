# Settings for the trip planner API. There is no database, nothing is stored.

import os
import warnings
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = os.environ.get("DJANGO_DEBUG") == "1"

ON_VERCEL = bool(os.environ.get("VERCEL"))
ON_RENDER = bool(os.environ.get("RENDER"))

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if ON_VERCEL or ON_RENDER:
        raise ImproperlyConfigured("Set DJANGO_SECRET_KEY for the deployed API.")
    SECRET_KEY = "dev-only-insecure-key-change-me"

ALLOWED_HOSTS = os.environ.get(
    "DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1],.vercel.app,.onrender.com"
).split(",")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "trips",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    },
]

DATABASES = {}

# The cache holds geocoding results and the throttle counters. Serverless
# instances don't share memory, so the deployed API needs REDIS_URL for the
# throttle to count across them.
REDIS_URL = os.environ.get("REDIS_URL")
if ON_VERCEL and not REDIS_URL:
    warnings.warn("REDIS_URL is not set: the rate limit is counted per instance.")
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
        "TIMEOUT": 60 * 60 * 24,
    }
    if REDIS_URL
    else {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "TIMEOUT": 60 * 60 * 24,
    }
}

# Vercel terminates TLS, redirects to HTTPS and sends HSTS in front of the API, and there
# are no cookies or forms here for CSRF to protect.
SILENCED_SYSTEM_CHECKS = ["security.W003", "security.W004", "security.W008"]

# No cookies or auth here, so any origin can call it.
CORS_ALLOW_ALL_ORIGINS = True

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"anon": "120/min"},
    # Throttle on the address the platform's proxy saw. Left unset, DRF takes
    # the whole X-Forwarded-For header, which a client can change on every
    # request to get a fresh allowance.
    "NUM_PROXIES": int(os.environ.get("NUM_PROXIES", "1" if ON_VERCEL or ON_RENDER else "0")),
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

OSRM_URL = os.environ.get("OSRM_URL", "https://router.project-osrm.org")
PHOTON_URL = os.environ.get("PHOTON_URL", "https://photon.komoot.io")
