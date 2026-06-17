from django.urls import path, include
from rest_framework.routers import DefaultRouter
from users.views import UserViewSet, FileUploadViewSet

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'uploads', FileUploadViewSet, basename='upload')

urlpatterns = [
    path('', include(router.urls)),
]
