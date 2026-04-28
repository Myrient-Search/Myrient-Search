FROM node:24-alpine
WORKDIR /app

# better-sqlite3 builds native bindings on Alpine.
RUN apk add --no-cache python3 make g++ git

COPY package*.json ./
RUN npm install
COPY . .

VOLUME ["/data"]
ENV MINERVA_CACHE_DIR=/data/minerva-cache

EXPOSE 3000
CMD ["npm", "start"]
