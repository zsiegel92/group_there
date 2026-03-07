"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import { useMemo, useRef, useState } from "react";
import { Layer, Map, Marker, Popup, Source } from "react-map-gl/mapbox";

import { computeInitialView, type MapPoint, type Route } from "./map-container";

function DestinationPin({ size }: { size: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 36"
      width={size}
      height={size * 1.5}
      style={{
        cursor: "pointer",
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
      }}
    >
      <path
        d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z"
        fill="#dc2626"
      />
      {/* Star shape for destination */}
      <polygon
        points="12,5 13.8,10 19,10.5 15,14 16.2,19 12,16.5 7.8,19 9,14 5,10.5 10.2,10"
        fill="white"
        transform="scale(0.65) translate(6.5, 4)"
      />
    </svg>
  );
}

function PersonPin({ size, color }: { size: number; color: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 32"
      width={size}
      height={size * (32 / 24)}
      style={{
        cursor: "pointer",
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
      }}
    >
      {/* Rounded rectangle badge */}
      <rect x="1" y="0" width="22" height="24" rx="6" fill={color} />
      {/* Pointer triangle */}
      <polygon points="8,23 16,23 12,32" fill={color} />
      {/* Person head */}
      <circle cx="12" cy="8.5" r="3.5" fill="white" />
      {/* Person shoulders */}
      <path
        d="M5.5 20.5c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"
        fill="white"
        stroke="white"
        strokeWidth="0.5"
      />
    </svg>
  );
}

const YOU_COLOR = "#0d9488"; // teal-600
const ORIGIN_COLOR = "#2563eb"; // blue-600

function MapboxMarker({ point }: { point: MapPoint }) {
  const [showPopup, setShowPopup] = useState(false);
  const isDestination = point.variant === "destination";
  const isYou = point.variant === "you";
  const size = isDestination ? 32 : isYou ? 30 : 26;
  const popupOffset = isDestination ? size * 1.5 : size * (32 / 24);

  return (
    <>
      <Marker
        latitude={point.latitude}
        longitude={point.longitude}
        anchor="bottom"
        onClick={(e) => {
          e.originalEvent.stopPropagation();
          setShowPopup(true);
        }}
      >
        {isDestination ? (
          <DestinationPin size={size} />
        ) : (
          <PersonPin size={size} color={isYou ? YOU_COLOR : ORIGIN_COLOR} />
        )}
      </Marker>
      {showPopup && (
        <Popup
          latitude={point.latitude}
          longitude={point.longitude}
          anchor="bottom"
          offset={popupOffset}
          onClose={() => setShowPopup(false)}
          closeButton={false}
          closeOnClick={false}
        >
          <div className="flex items-center gap-2 pr-1">
            <span className="text-sm font-medium">{point.label}</span>
            <button
              onClick={() => setShowPopup(false)}
              className="text-gray-400 hover:text-gray-700 text-lg leading-none p-1 -mr-1 cursor-pointer"
            >
              &times;
            </button>
          </div>
        </Popup>
      )}
    </>
  );
}

export default function MapboxMap({
  points,
  routes = [],
}: {
  points: MapPoint[];
  routes?: Route[];
}) {
  const [viewState, setViewState] = useState(computeInitialView(points));
  const mapRef = useRef<React.ComponentRef<typeof Map>>(null);

  const routeData = useMemo(
    () =>
      routes.map((route) => {
        const feature: GeoJSON.Feature<GeoJSON.LineString> = {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: route.coordinates,
          },
        };
        return { feature, color: route.color };
      }),
    [routes]
  );

  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) {
    return (
      <div className="h-[400px] bg-gray-100 rounded-lg flex items-center justify-center text-gray-500">
        Map unavailable (no Mapbox token configured)
      </div>
    );
  }

  return (
    <Map
      ref={mapRef}
      {...viewState}
      onMove={(evt) => setViewState(evt.viewState)}
      mapboxAccessToken={token}
      mapStyle="mapbox://styles/mapbox/streets-v12"
      style={{ width: "100%", height: 400, borderRadius: 8 }}
    >
      {routeData.map((rd, i) => (
        <Source
          key={`route-${i}`}
          id={`route-${i}`}
          type="geojson"
          data={rd.feature}
        >
          <Layer
            id={`route-line-${i}`}
            type="line"
            paint={{
              "line-color": rd.color,
              "line-width": 4,
              "line-opacity": 0.8,
            }}
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
          />
        </Source>
      ))}
      {points.map((point, i) => (
        <MapboxMarker
          key={`${point.latitude}-${point.longitude}-${i}`}
          point={point}
        />
      ))}
    </Map>
  );
}
