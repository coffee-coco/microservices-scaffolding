TOKEN=$(curl -s -X POST http://localhost:3000/login | jq -r '.token')
curl -X GET http://localhost:3000/status -H "Authorization: Bearer $TOKEN"
TOKEN=$(curl -s -X POST http://localhost:3000/refresh -H "Authorization: Bearer $TOKEN" | jq -r '.token')
curl -X GET http://localhost:3000/status -H "Authorization: Bearer $TOKEN"




