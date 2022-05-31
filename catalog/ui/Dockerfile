FROM registry.redhat.io/rhel8/nodejs-14-minimal:latest AS builder
USER root 
WORKDIR /build
ARG STATUS_PAGE_ID
ARG MONITOR

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY ./ ./
RUN npm run build

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
