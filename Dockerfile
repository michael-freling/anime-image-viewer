ARG GO_VERSION=1.23.4
ARG NODE_VERSION=22.11

# https://hub.docker.com/r/michaelfreling/wails
FROM michaelfreling/wails:3-go-${GO_VERSION}-node-${NODE_VERSION}

ARG OS=windows
ARG ARCH=amd64
ARG ENV=prod

WORKDIR /

ENV GOPATH /go
ENV PATH "$PATH:/go/bin:/usr/local/go/bin"

# Enable to build a Windows binary on Linux
# https://stackoverflow.com/questions/41566495/golang-how-to-cross-compile-on-linux-for-windows
RUN apt update && \
    apt -y install gcc-multilib gcc-mingw-w64

## Download dependencies and cache them earlier
## https://bitjudo.com/blog/2014/03/13/building-efficient-dockerfiles-node-dot-js/
ADD frontend/package.json frontend/package-lock.json /tmp/
RUN cd /tmp && npm install
RUN mkdir -p /app/frontend && cp -a /tmp/node_modules /app/frontend/

ADD go.mod go.sum /gotmp/
ADD plugins/plugins-protos /gotmp/plugins/plugins-protos
RUN cd /gotmp && go mod download

COPY . /app
WORKDIR /app

RUN wails3 task build:${OS}:${ENV}:${ARCH}
