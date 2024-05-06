FROM registry.access.redhat.com/ubi9/nginx-120

# Add application sources to a directory that the assemble script expects them
# and set permissions so that the container runs without root access
USER root
WORKDIR /opt/app-root/src/
COPY nginx-default-cfg/*.conf "${NGINX_DEFAULT_CONF_PATH}"
COPY *.html /opt/app-root/src/
COPY *.css /opt/app-root/src/
COPY *.js /opt/app-root/src/
COPY assets /opt/app-root/src/assets
COPY interfaces /opt/app-root/src/interfaces

RUN chown -R 1001:0 /opt/app-root/src/ && \
    chmod -R g+w /opt/app-root/src/
USER 1001

# Run script uses standard ways to run the application
CMD /usr/libexec/s2i/run

EXPOSE 8080
