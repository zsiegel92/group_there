"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

import {
  computeBounds,
  computeInitialView,
  type MapPoint,
} from "./map-container";

const DESTINATION_COLOR = "#dc2626";
const ORIGIN_COLOR = "#2563eb";

function makeIcon(color: string, size: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="${size}" height="${Math.round(size * 1.5)}">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [size, Math.round(size * 1.5)],
    iconAnchor: [size / 2, Math.round(size * 1.5)],
    popupAnchor: [0, -Math.round(size * 1.5)],
  });
}

export default function LeafletMapComponent({
  points,
}: {
  points: MapPoint[];
}) {
  const initial = computeInitialView(points);
  const bounds = computeBounds(points);

  const mapProps =
    bounds && points.length > 1
      ? {
          bounds: [
            [bounds.minLat, bounds.minLng],
            [bounds.maxLat, bounds.maxLng],
          ] satisfies [[number, number], [number, number]],
          boundsOptions: { padding: [50, 50] satisfies [number, number] },
        }
      : {
          center: [initial.latitude, initial.longitude] satisfies [
            number,
            number,
          ],
          zoom: initial.zoom,
        };

  return (
    <MapContainer
      {...mapProps}
      scrollWheelZoom={true}
      style={{ width: "100%", height: 400, borderRadius: 8 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((point, i) => {
        const color =
          point.variant === "destination" ? DESTINATION_COLOR : ORIGIN_COLOR;
        const size = point.variant === "destination" ? 24 : 18;
        return (
          <Marker
            key={`${point.latitude}-${point.longitude}-${i}`}
            position={[point.latitude, point.longitude]}
            icon={makeIcon(color, size)}
          >
            <Popup>
              <div className="text-sm font-medium">
                {point.variant === "destination" ? "Destination: " : ""}
                {point.label}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
