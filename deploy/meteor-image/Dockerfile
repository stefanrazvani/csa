FROM urgentit/meteor:2.2

ARG PASSENGER_VERSION=1:6.1.7-1~noble1

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      passenger=${PASSENGER_VERSION} \
      libnginx-mod-http-passenger=${PASSENGER_VERSION} \
    && passenger-config --version \
    && rm -rf /var/lib/apt/lists/*
