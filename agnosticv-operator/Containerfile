FROM quay.io/redhat-cop/python-kopf-s2i:v1.36

USER 0

COPY . /tmp/src

RUN rm -rf /tmp/src/.git* && \
    chown -R 1001 /tmp/src && \
    chgrp -R 0 /tmp/src && \
    chmod -R g+w /tmp/src && \
    cp -rp /tmp/src/.s2i/bin /tmp/scripts

USER 1001

RUN cd /tmp/src && /tmp/scripts/assemble

CMD ["/usr/libexec/s2i/run"]
