from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import geo
from .planning import build_plan
from .serializers import TripSerializer


@api_view(["GET"])
def health(request):
    return Response({"status": "ok"})


@api_view(["GET"])
def locations(request):
    query = request.query_params.get("q", "").strip()
    if not 3 <= len(query) <= 200:
        return Response([])
    try:
        return Response(geo.default_service().search(query))
    except geo.GeoError:
        # no suggestions is fine, the form takes free text too
        return Response([])


@api_view(["POST"])
def plan(request):
    serializer = TripSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        return Response(build_plan(serializer.validated_data, geo.default_service()))
    except geo.Unavailable as exc:
        return Response({"detail": str(exc)}, status=503)
    except geo.GeoError as exc:
        return Response({"detail": str(exc)}, status=422)
