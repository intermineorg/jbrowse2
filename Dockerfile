# JBrowse 2 for InterMine, served as static files by nginx.
#
# jbrowse-web is a pure client-side application. The plugin built here from
# plugin/ teaches it to read each mine's own web service
# (<mine root>/service/jbrowse/...) from the browser; nothing in this image
# talks to a mine. config.json (docker/config.json) is generated from the
# mines' track lists by config/generate.mjs and committed, so the build does
# not depend on a mine being up. See README.md and docs/DEPLOY.md.
#
# The jbrowse-web release is downloaded at build time and checked against a
# pinned SHA-256, so the image is reproducible.

FROM alpine:3.20 AS fetch
ARG JBROWSE_VERSION=4.3.0
ARG JBROWSE_SHA256=a9d42417102ee088a1cbf85c6d857c1065d66984ea6c56f3115ef9dd56d76702
RUN apk add --no-cache curl unzip \
 && curl -fsSL -o /tmp/jbrowse-web.zip \
      "https://github.com/GMOD/jbrowse-components/releases/download/v${JBROWSE_VERSION}/jbrowse-web-v${JBROWSE_VERSION}.zip" \
 && echo "${JBROWSE_SHA256}  /tmp/jbrowse-web.zip" | sha256sum -c - \
 && unzip -q /tmp/jbrowse-web.zip -d /jbrowse \
 # the release bundles a demo config and sample data; the InterMine config replaces them
 && rm -rf /jbrowse/test_data /jbrowse/config.json

FROM node:22-alpine AS plugin
WORKDIR /plugin
COPY plugin/package.json plugin/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY plugin/tsconfig.json plugin/rollup.config.mjs ./
COPY plugin/src ./src
RUN npm run build

FROM nginx:1.27.1-alpine
COPY --from=fetch /jbrowse /usr/share/nginx/html
COPY --from=plugin /plugin/dist/jbrowse-plugin-intermine.umd.production.min.js /usr/share/nginx/html/
COPY docker/config.json /usr/share/nginx/html/config.json
COPY default.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK CMD wget -qO /dev/null http://127.0.0.1/config.json || exit 1
