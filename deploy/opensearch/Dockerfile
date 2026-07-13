ARG OPENSEARCH_BASE_IMAGE=opensearchproject/opensearch:3.7.0
FROM ${OPENSEARCH_BASE_IMAGE}

USER root
RUN dnf install -y util-linux \
    && dnf clean all \
    && rm -rf /var/cache/dnf
COPY docker-entrypoint.sh /usr/local/bin/csa-opensearch-entrypoint
RUN chmod 755 /usr/local/bin/csa-opensearch-entrypoint

ENTRYPOINT ["/usr/local/bin/csa-opensearch-entrypoint"]
