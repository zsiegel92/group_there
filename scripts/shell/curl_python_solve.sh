source .env

curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${GROUPTHERE_SOLVER_API_KEY}" \
  -d '{
    "id": "problem-123",
    "event_id": "123",
    "trippers": [
      {
        "user_id": "user1",
        "origin_id": "origin1",
        "event_id": "123",
        "can_drive": true,
        "non_driver_seats": 4,
        "must_drive": false,
        "seconds_before_event_start_can_leave": 600,
        "distance_to_destination_seconds": 300
      }
    ],
    "tripper_distances": []
  }' http://localhost:8000/solve
