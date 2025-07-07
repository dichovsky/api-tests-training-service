
FROM node:24-alpine3.22

# Set environment variable for port, default to 3000 if not set
ENV PORT=3000
EXPOSE ${PORT}

# Set working directory
WORKDIR /app

# Copy files from the current directory to the container
# This assumes your Dockerfile is in the root of your project
COPY . .

# Install dependencies
RUN npm ci
CMD ["npm", "start"]