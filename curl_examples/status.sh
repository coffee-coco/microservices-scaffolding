TOKEN=$(curl -s -X POST http://localhost:3000/login | jq -r '.token')
echo $TOKEN
curl -v -X GET http://localhost:3000/status -H "Authorization: Bearer $TOKEN"