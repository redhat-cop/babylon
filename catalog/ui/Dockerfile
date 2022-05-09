FROM node:18.1.0-alpine AS builder
WORKDIR /build
COPY . /build
RUN npm install rimraf && \
    npm run build

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
