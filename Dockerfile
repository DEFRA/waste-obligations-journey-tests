FROM node:22.13.1-slim

ENV TZ="Europe/London"

USER root

RUN apt-get update -qq \
    && apt-get install -qqy --no-install-recommends \
        curl \
        zip \
        unzip \
        ca-certificates \
        openjdk-17-jre-headless

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf awscliv2.zip aws \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

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
