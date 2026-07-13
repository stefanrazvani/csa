FROM node:22.21.1-alpine3.22

ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache su-exec

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

COPY server.js access-utils.js clamav-utils.js document-utils.js dossier-utils.js object-store-utils.js ./
COPY docker-entrypoint.sh /usr/local/bin/csa-gateway-auth-entrypoint
RUN chmod 755 /usr/local/bin/csa-gateway-auth-entrypoint
USER root
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/csa-gateway-auth-entrypoint"]
CMD ["node", "server.js"]
