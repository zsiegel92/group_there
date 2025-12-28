source .env

curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${GROUPTHERE_SOLVER_API_KEY}" \
  -d '{
    "event_id": "123",
    "trippers": [
      {
        "event_id": "123",
		"trippers": [],
		"tripper_origin_distances_seconds": {}
      }
    ]
  }' http://localhost:8000/solve