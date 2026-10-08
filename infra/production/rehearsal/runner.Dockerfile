# Ubuntu 24.04 with the tools of a production host, to run the rehearsal from
# a non-Linux workstation against its Docker daemon (the socket is mounted).
# Linux hosts and CI run rehearsal/run.sh directly instead.
#   docker build -t ia-mns-rehearsal-runner -f infra/production/rehearsal/runner.Dockerfile infra/production/rehearsal
FROM ubuntu:24.04@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg git python3 openssl age util-linux \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc \
  && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" \
       > /etc/apt/sources.list.d/docker.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin docker-compose-plugin \
  && rm -rf /var/lib/apt/lists/*
