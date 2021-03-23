FROM node:15.11.0-alpine AS builder
WORKDIR /build
COPY ui /build
RUN ./build.sh

FROM registry.access.redhat.com/ubi8/python-38:latest

USER root

COPY api /tmp/src

RUN rm -rf /tmp/src/.git* && \
    chown -R 1001 /tmp/src && \
    chgrp -R 0 /tmp/src && \
    chmod -R g+w /tmp/src

USER 1001

RUN /usr/libexec/s2i/assemble

COPY --from=builder /build/dist /opt/app-root/src/static

EXPOSE 8080

CMD /usr/libexec/s2i/run
