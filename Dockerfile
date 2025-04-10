FROM node:18-alpine

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Create necessary directories
RUN mkdir -p /app/src/public

# Set proper permissions
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose the port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "dev"]
