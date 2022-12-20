FROM registry.access.redhat.com/ubi8/python-39:latest

USER root

COPY ./api /tmp/src
COPY ./requirements.txt /tmp/src

RUN rm -rf /tmp/src/.git* && \
    chown -R 1001 /tmp/src && \
    chgrp -R 0 /tmp/src && \
    chmod -R g+w /tmp/src

USER 1001

RUN /usr/libexec/s2i/assemble

EXPOSE 8080

CMD /usr/libexec/s2i/run
