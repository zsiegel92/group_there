# source .env
curl -X POST -d '{
  "origin":{
    "address": "1600 Amphitheatre Parkway, Mountain View, CA"
  },
  "destination":{
    "address": "450 Serra Mall, Stanford, CA"
  }
}' \
-H 'Content-Type: application/json' -H "X-Goog-Api-Key: $GOOGLE_ROUTES_API_KEY" \
-H 'X-Goog-FieldMask: routes.duration,routes.distanceMeters' \
'https://routes.googleapis.com/directions/v2:computeRoutes'