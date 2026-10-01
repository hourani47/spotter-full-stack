import PropTypes from 'prop-types'
import { placeType, segmentType } from '../propTypes'
import { useEffect } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { formatDay, formatDuration, formatTime } from '../format'

const USA = [[25, -124], [49, -67]]

const GLYPHS = {
  start: 'A',
  pickup: 'P',
  dropoff: 'D',
  fuel: 'F',
  break: '30',
  rest: '10',
  restart: '34',
}
const TITLES = {
  start: 'Start',
  pickup: 'Pickup',
  dropoff: 'Drop-off',
  fuel: 'Fuel stop',
  break: '30-minute break',
  rest: '10-hour rest',
  restart: '34-hour restart',
}

const MAJOR = ['start', 'pickup', 'dropoff']

function icon(kind) {
  const size = MAJOR.includes(kind) ? 34 : 26
  return L.divIcon({
    className: '',
    html: `<span class="pin pin-${kind}">${GLYPHS[kind]}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

function View({ geometry, focus }) {
  const map = useMap()
  useEffect(() => {
    if (geometry) map.fitBounds(geometry, { padding: [36, 36] })
    else map.fitBounds(USA)
  }, [map, geometry])
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 9), { duration: 0.8 })
  }, [map, focus])
  return null
}

export default function RouteMap({ plan, focus }) {
  const geometry = plan?.route.geometry
  const start = plan && {
    kind: 'start',
    ...plan.locations.current,
    location: plan.locations.current.short,
    start: plan.summary.start,
  }
  const stops = plan ? [start, ...plan.stops] : []

  return (
    <MapContainer bounds={USA} scrollWheelZoom className="map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <View geometry={geometry} focus={focus} />
      {geometry && (
        <>
          <Polyline positions={geometry} pathOptions={{ className: 'route-casing', weight: 8, opacity: 0.9 }} />
          <Polyline positions={geometry} pathOptions={{ className: 'route-line', weight: 4 }} />
        </>
      )}
      {stops.map((stop) => (
        <Marker
          key={`${stop.kind}-${stop.start}`}
          position={[stop.lat, stop.lng]}
          icon={icon(stop.kind)}
          zIndexOffset={MAJOR.includes(stop.kind) ? 500 : 0}
        >
          <Popup>
            <strong>{TITLES[stop.kind]}</strong>
            <br />
            {stop.location}
            <br />
            {formatDay(stop.start)}, {formatTime(stop.start)}
            {stop.minutes ? ` for ${formatDuration(stop.minutes)}` : ''}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}

View.propTypes = {
  geometry: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)),
  focus: PropTypes.shape({ lat: PropTypes.number.isRequired, lng: PropTypes.number.isRequired }),
}

RouteMap.propTypes = {
  plan: PropTypes.shape({
    route: PropTypes.shape({ geometry: View.propTypes.geometry.isRequired }).isRequired,
    locations: PropTypes.shape({ current: placeType.isRequired }).isRequired,
    summary: PropTypes.shape({ start: PropTypes.string.isRequired }).isRequired,
    stops: PropTypes.arrayOf(segmentType).isRequired,
  }),
  focus: View.propTypes.focus,
}
