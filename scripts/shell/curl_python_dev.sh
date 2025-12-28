source .env
curl -X POST -d '{
  "event_id": "123",
  "trippers": [
    {
      "id": "123",
      "user_id": "123",
      "origin_id": "123"
    }
  ]
}' http://localhost:8000/solve