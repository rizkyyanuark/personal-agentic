FROM --platform=linux/arm64 ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive container=docker
RUN apt-get update && apt-get install -y --no-install-recommends systemd systemd-sysv dbus-user-session libssl3t64 ca-certificates curl jq unzip zip coreutils gawk git nginx-light openssl && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 agent \
    && mkdir -p /var/lib/systemd/linger /home/agent/projects \
    && touch /var/lib/systemd/linger/agent \
    && chown agent:agent /home/agent/projects
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
