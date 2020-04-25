rsync -rav -e ssh --exclude='.*' --exclude='node_modules' backend/ root@dominoparty.tk:backend/
scp docker-compose.yml  root@dominoparty.tk:
scp redis.conf root@dominoparty.tk:
ssh root@dominoparty.tk "docker-compose down"
ssh root@dominoparty.tk "docker-compose build; docker-compose up -d"

