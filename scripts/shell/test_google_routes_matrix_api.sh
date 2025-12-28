source .env
curl -X POST -d '{
  "origins": [
    {
      "waypoint": {
        "location": {
          "latLng": {
            "latitude": 37.420761,
            "longitude": -122.081356
          }
        }
      },
      "routeModifiers": { "avoid_ferries": true}
    },
    {
      "waypoint": {
        "location": {
          "latLng": {
            "latitude": 37.403184,
            "longitude": -122.097371
          }
        }
      },
      "routeModifiers": { "avoid_ferries": true}
    }
  ],
  "destinations": [
    {
      "waypoint": {
        "location": {
          "latLng": {
            "latitude": 37.420999,
            "longitude": -122.086894
          }
        }
      }
    },
    {
      "waypoint": {
        "location": {
          "latLng": {
            "latitude": 37.383047,
            "longitude": -122.044651
          }
        }
      }
    }
  ],
  "travelMode": "DRIVE",
  "routingPreference": "TRAFFIC_AWARE"
}' \
-H 'Content-Type: application/json' -H "X-Goog-Api-Key: $GOOGLE_ROUTES_API_KEY" \
-H 'X-Goog-FieldMask: originIndex,destinationIndex,duration,distanceMeters,status,condition' \
'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix'