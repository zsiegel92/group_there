source .env

curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${GROUPTHERE_SOLVER_API_KEY}" \
  -d '{
    "event_id": "123",
    "trippers": [
      {
        "id": "tripper1",
        "user_id": "user1",
        "origin_id": "origin1",
        "event_id": "123",
        "car_fits": 4,
        "seconds_before_event_start_can_leave": 600
      }
    ],
    "tripper_origin_distances_seconds": {}
  }' http://localhost:8000/solve