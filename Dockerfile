# Use an official Node.js image as a base
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /MUNDO

# Copy server/package*.json into the container
COPY server/package*.json ./server/

# Copy the rest of the server files into the container
COPY server/ ./server/
# Copy the .env file into the server directory
COPY server/.env ./server/


# Install dependencies for the server
WORKDIR /MUNDO/server
RUN npm install

# Copy the client folder into the container (if you're serving static files)
COPY Client/ ./Client/

# Expose necessary ports (e.g., 3000 for the server, 8080 for the client)
EXPOSE 3000

# Run the server using node from the server directory
CMD ["node", "server.js"]
