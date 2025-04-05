TOKEN=$(curl -s -X POST http://localhost:3000/login | jq -r '.token')
curl -X GET http://localhost:3000/protected -H "Authorization: Bearer $TOKEN"