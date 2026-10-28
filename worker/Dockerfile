FROM node:22-bookworm-slim AS openwa
ARG OPENWA_VERSION=v0.26.0
WORKDIR /opt/openwa
ENV PUPPETEER_CACHE_DIR=/opt/openwa/.cache/puppeteer
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    patch \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL "https://github.com/rmyndharis/OpenWA/archive/refs/tags/${OPENWA_VERSION}.tar.gz" -o /tmp/openwa.tgz \
  && mkdir -p /tmp/extract \
  && tar -xzf /tmp/openwa.tgz -C /tmp/extract \
  && extracted="$(ls /tmp/extract)" \
  && cp -a "/tmp/extract/${extracted}/." /opt/openwa/ \
  && echo "${OPENWA_VERSION}" > /opt/openwa/.2tapdoc-openwa-version \
  && npm ci --no-audit --no-fund \
  && npm run build \
  && npm prune --omit=dev \
  && rm -rf /tmp/openwa.tgz /tmp/extract

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV OPENWA_DIR=/opt/openwa
ENV OPENWA_DATA_DIR=/var/lib/openwa
ENV PUPPETEER_CACHE_DIR=/opt/openwa/.cache/puppeteer
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-6 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /var/lib/openwa
COPY --from=openwa /opt/openwa /opt/openwa
RUN rm -rf /opt/openwa/data \
  && ln -s /var/lib/openwa /opt/openwa/data \
  && chown -R node:node /var/lib/openwa /opt/openwa
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
VOLUME /var/lib/openwa
CMD ["node", "dist/index.js"]
