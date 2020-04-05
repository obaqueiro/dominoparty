FROM node:12

WORKDIR /usr/src/app

copy package*.json  ./
RUN npm install
RUN npm install -g ts-node
COPY . .
EXPOSE 3000

CMD ["ts-node", "app/app.ts"]
