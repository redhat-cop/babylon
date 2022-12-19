FROM registry.access.redhat.com/ubi8/python-38:latest

USER root

COPY . /tmp/src

RUN chown -R 1001:0 /tmp/src && \
    chmod -R g+w /tmp/src

USER 1001

RUN /usr/libexec/s2i/assemble

EXPOSE 8080

CMD /usr/libexec/s2i/run
