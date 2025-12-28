source .env
curl -X GET \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${GROUPTHERE_SOLVER_API_KEY}" \
  http://localhost:8000/