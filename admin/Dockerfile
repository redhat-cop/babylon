FROM registry.access.redhat.com/ubi8/python-39:latest

USER root

COPY . /tmp/src

COPY ./.s2i/bin /tmp/scripts/s2i

RUN rm -rf /tmp/src/.git* && \
    chown -R 1001 /tmp/src && \
    chown -R 1001 /tmp/scripts && \
    chgrp -R 0 /tmp/src && \
    chgrp -R 0 /tmp/scripts && \
    chmod -R g+w /tmp/src && \
    chmod -R +x /tmp/scripts

USER 1001

RUN /tmp/scripts/s2i/assemble

CMD ["/tmp/scripts/s2i/run"]
