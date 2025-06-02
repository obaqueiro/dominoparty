FROM node:18-alpine

WORKDIR /usr/src/app

# Install nodemon globally
RUN npm install -g nodemon ts-node

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

COPY . .
# We don't copy the source code here anymore as it will be mounted as a volume
EXPOSE 3000

# Use nodemon to watch for changes
CMD ["nodemon", "--watch", "app", "--ext", "ts", "--exec", "ts-node", "app/app.ts"]
