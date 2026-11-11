from django.http import HttpResponse


class CorsMiddleware:
    """Allow Android APK and web clients to interact with /api/* cleanly."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == 'OPTIONS' and request.path.startswith('/api/'):
            response = HttpResponse(status=204)
        else:
            response = self.get_response(request)

        if request.path.startswith('/api/'):
            origin = request.META.get('HTTP_ORIGIN')
            if origin:
                response['Access-Control-Allow-Origin'] = origin
                response['Access-Control-Allow-Credentials'] = 'true'
            else:
                response['Access-Control-Allow-Origin'] = '*'
            response['Access-Control-Allow-Headers'] = 'Content-Type, X-File-Name, X-CSRFToken'
            response['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, DELETE, OPTIONS'
        return response
