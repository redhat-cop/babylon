# Builder image
FROM registry.redhat.io/rhel9/nodejs-16-minimal:latest AS builder
USER root 
WORKDIR /build
ARG STATUS_PAGE_ID
ARG MONITOR_ENABLED
ARG TRACKING_ENABLED
ARG OPTIONAL_FLAGS

ENV KEEP_ASSETS=true
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY ./ ./
RUN npm run build

# Server image
FROM registry.access.redhat.com/ubi8/nginx-118:latest
USER root

COPY --from=builder /build/dist /tmp/src
COPY nginx-default-cfg /tmp/src/nginx-default-cfg

RUN chown -R 1001:0 /tmp/src && \
    chmod -R g+w /tmp/src
USER 1001
RUN /usr/libexec/s2i/assemble

EXPOSE 8080
CMD /usr/libexec/s2i/run
