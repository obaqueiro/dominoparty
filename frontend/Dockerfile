# Use Node.js LTS version with a more compatible base image
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with platform-specific flags
RUN npm install --platform=linux --arch=x64

# Copy the rest of the application
COPY . .

# Expose port 4200
EXPOSE 4200

# Start the application
CMD ["npm", "start", "--", "--host", "0.0.0.0", "--disable-host-check"] 