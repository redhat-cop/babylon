FROM registry.access.redhat.com/ubi9/nginx-120

# Add application sources to a directory that the assemble script expects them
# and set permissions so that the container runs without root access
USER root

ADD nginx-default-cfg/nginx.conf "${NGINX_CONFIGURATION_PATH}"
ADD nginx-default-cfg/redirect.conf "${NGINX_DEFAULT_CONF_PATH}"
ADD *.html .
ADD *.css .
ADD *.js .
COPY assets ./assets
COPY interfaces ./interfaces

USER 1001

EXPOSE 8080
EXPOSE 8443

# Run script uses standard ways to run the application
CMD nginx -g "daemon off;"
