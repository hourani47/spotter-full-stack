from rest_framework import serializers


class LocationField(serializers.Field):
    """Either free text, or a {label, lat, lng} picked from the suggestions."""

    def to_internal_value(self, data):
        if isinstance(data, str):
            if not data.strip():
                raise serializers.ValidationError("Enter a location.")
            if len(data) > 200:
                raise serializers.ValidationError("That location is too long.")
            return data.strip()
        if isinstance(data, dict):
            try:
                lat, lng = float(data["lat"]), float(data["lng"])
            except (KeyError, TypeError, ValueError):
                raise serializers.ValidationError("Location needs lat and lng.")
            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                raise serializers.ValidationError("Location is out of range.")
            label = str(data.get("label") or f"{lat:.3f}, {lng:.3f}")[:200]
            short = str(data.get("short") or label)[:200]
            return {"label": label, "short": short, "lat": lat, "lng": lng}
        raise serializers.ValidationError("Enter a location.")

    def to_representation(self, value):
        return value


class WallClockField(serializers.DateTimeField):
    """A date and time read as the clock at the home terminal.

    An offset on the value is dropped, not converted, so 23:50+05:00 is 23:50.
    """

    def enforce_timezone(self, value):
        return value.replace(tzinfo=None)

    def to_internal_value(self, value):
        parsed = super().to_internal_value(value)
        # a long trip adds days to this, so stay well inside what datetime holds
        if not 2000 <= parsed.year <= 2100:
            raise serializers.ValidationError("Enter a date between 2000 and 2100.")
        return parsed


class TripSerializer(serializers.Serializer):
    current_location = LocationField()
    pickup_location = LocationField()
    dropoff_location = LocationField()
    current_cycle_used = serializers.FloatField(min_value=0, max_value=70)
    # home terminal time. Required: the server's clock is not the driver's.
    start_time = WallClockField()
