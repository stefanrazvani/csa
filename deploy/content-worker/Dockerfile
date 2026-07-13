FROM node:22.19.0-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates gosu poppler-utils \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home --home-dir /home/worker worker

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

COPY worker.js healthcheck.js projection-utils.js ./
COPY docker-entrypoint.sh /usr/local/bin/csa-content-worker-entrypoint
RUN chown -R worker:worker /app /home/worker
RUN chmod 755 /usr/local/bin/csa-content-worker-entrypoint

USER root
ENTRYPOINT ["/usr/local/bin/csa-content-worker-entrypoint"]
CMD ["node", "worker.js"]
