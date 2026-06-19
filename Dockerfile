FROM node:22.13.1-slim

ENV TZ="Europe/London"

USER root

RUN apt-get update -qq \
    && apt-get install -qqy --no-install-recommends \
        curl \
        zip \
        unzip \
        ca-certificates \
        jq \
        openjdk-17-jre-headless

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf awscliv2.zip aws \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# OWASP ZAP for the `security` profile. Pinned so image builds are reproducible.
ENV ZAP_VERSION=2.16.1
RUN curl -fsSL "https://github.com/zaproxy/zaproxy/releases/download/v${ZAP_VERSION}/ZAP_${ZAP_VERSION}_Linux.tar.gz" -o /tmp/zap.tar.gz \
    && mkdir -p /opt/zap \
    && tar -xzf /tmp/zap.tar.gz -C /opt/zap --strip-components=1 \
    && rm /tmp/zap.tar.gz \
    && ln -s /opt/zap/zap.sh /usr/local/bin/zap.sh

WORKDIR /app

# Copy manifest first for better Docker layer caching
COPY package*.json .
RUN npm install

# Install every browser/channel the matrix needs so `npm test` runs all six
# projects (chrome-mac, chrome-windows, edge-windows, safari-mac, safari-ios,
# chrome-android) in the CDP container.
RUN npx playwright install --with-deps chromium webkit chrome msedge

# Copy the rest of the test code
COPY . .

ENTRYPOINT [ "./entrypoint.sh" ]

# Image built for linux/amd64. On Apple Silicon, build/run with --platform=linux/amd64.
