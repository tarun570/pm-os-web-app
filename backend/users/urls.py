from django.urls import path, include
from rest_framework.routers import DefaultRouter
from users.views import UserViewSet, FileUploadViewSet, google_drive_callback

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'uploads', FileUploadViewSet, basename='upload')

# IMPORTANT: the plain `path()` for the OAuth callback MUST be listed BEFORE
# `include(router.urls)`. The DefaultRouter registers a `users/<pk>/` pattern
# that would otherwise match `users/google_drive_callback/` (treating
# 'google_drive_callback' as a pk), shadowing our plain Django view and
# returning a DRF 404. Listing this path first ensures Django matches the
# literal path before falling through to the router.
urlpatterns = [
    path('users/google_drive_callback/', google_drive_callback, name='google_drive_callback'),
    path('', include(router.urls)),
]
