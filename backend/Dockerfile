FROM node:24-slim
WORKDIR /app

# Native module build deps (better-sqlite3, etc.). Debian/glibc base — Alpine
# (musl) was causing SIGSEGV under heavy concurrent UDP socket churn from
# WebTorrent trackers + DHT.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install
COPY . .

VOLUME ["/data"]
ENV MINERVA_CACHE_DIR=/data/minerva-cache

EXPOSE 3000
# Run node directly — npm wraps the process and obscures signals on crash.
CMD ["node", "server.js"]
