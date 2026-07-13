ARG CLAMAV_BASE_IMAGE=clamav/clamav:1.4.3
FROM ${CLAMAV_BASE_IMAGE}

USER root
RUN set -eux; \
    sed -ri 's/^[# ]*StreamMaxLength[[:space:]].*/StreamMaxLength 300M/' /etc/clamav/clamd.conf; \
    sed -ri 's/^[# ]*ConcurrentDatabaseReload[[:space:]].*/ConcurrentDatabaseReload no/' /etc/clamav/clamd.conf; \
    grep -q '^StreamMaxLength 300M$' /etc/clamav/clamd.conf; \
    grep -q '^ConcurrentDatabaseReload no$' /etc/clamav/clamd.conf
