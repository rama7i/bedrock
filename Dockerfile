FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Create directories and set permissions
RUN mkdir -p src/public && chown -R node:node /app

# Copy the rest of the application
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Use node user instead of root
USER node

# Command to run the application
CMD ["node", "src/index.js"]
