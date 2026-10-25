# Deploying JBrowse 2 for InterMine

What runs: one nginx container (`jbrowse2`) serving jbrowse-web, the
`jbrowse-plugin-intermine` bundle and a generated `config.json`. Like the
JBrowse 1 container it holds no data and never talks to a mine; each
visitor's browser reads genome data from the mine's `service/jbrowse`
endpoints (CORS is open on them). JBrowse 1 keeps running alongside, because
the classic webapp and the current BlueGenes tool use its URLs.

Steps that need the maintainer or the front-end admins are marked **(you)**;
nothing here has been done on the production server.

## 1. Build and start

```sh
git clone https://github.com/intermineorg/jbrowse2.git ~/intermine/docker/jbrowse2
cd ~/intermine/docker/jbrowse2
cp .env.example .env            # optional: change JBROWSE2_HTTP_PORT (default 14881)
docker compose up -d --build
docker ps --filter name=jbrowse2 --format '{{.Names}} {{.Status}}'   # ... (healthy)
curl -s http://localhost:14881/config.json | head -c 200
```

The container speaks plain HTTP on the host port. Browsers refuse an
`http://` iframe inside an `https://` page, so publish it over HTTPS (next
section).

`docker/smoke-test.sh` builds the image, starts it and checks the things
deployment depends on (served at the root, iframe-able, config not cached,
CORS, static assets cached, healthcheck). `BROWSER=1 docker/smoke-test.sh`
additionally drives it in headless Chromium against the live mine (see
`plugin/README.md` for the browser requirements).

## 2. Publish it

### Route A (the plan): https://jbrowse2.intermine.org/ **(you / DBCLS admins)**

Ask the front-end admins for a virtual host named `jbrowse2.intermine.org`
with its own certificate, proxying to `127.0.0.1:14881`: the same as
`jbrowse.intermine.org` in the intermineorg/jbrowse README ("Route A") with
the name and port changed.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name jbrowse2.intermine.org;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name jbrowse2.intermine.org;
    ssl_certificate     /etc/letsencrypt/live/jbrowse2.intermine.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jbrowse2.intermine.org/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:14881;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

The certificate must cover the name, or every visitor gets a warning and the
iframe stays blank. JBrowse 2 is then served at the site root and every mine
uses the same URL with no change to `docker_template`. The container must be
up and answering on 14881 before the admins can test it, so start it first.

Check:

```sh
curl -sI https://jbrowse2.intermine.org/ | head -1       # HTTP/2 200
curl -s  https://jbrowse2.intermine.org/config.json | head -c 100
```

### Route B (fallback): `https://www.<mine>.org/jbrowse2/`

Only if the hostname is unavailable. Verified with a front nginx in front of
the built image: it works with the same location block as JBrowse 1, because
the jbrowse-web build uses *relative* asset URLs (`src="static/js/..."`), so
no base-path rewriting of the build is needed. (PLAN.md assumed absolute
URLs; they are not, in 4.3.0.)

1. Join the container to each mine's frontend network:
   `cp docker-compose.override.yml.example docker-compose.override.yml`, list
   your mines' networks, `docker compose up -d`.
2. In each mine's front end (docker_template's `nginx/nginx.conf.template`,
   beside `/jbrowse/`):

   ```nginx
   location /jbrowse2/ {
       resolver 127.0.0.11 valid=10s ipv6=off;
       set $jbrowse2 http://jbrowse2:80;
       rewrite ^/jbrowse2/(.*)$ /$1 break;
       proxy_pass $jbrowse2;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-Proto https;
   }
   location = /jbrowse2 {
       absolute_redirect off;
       return 301 /jbrowse2/;
   }
   ```

   The upstream is a runtime-resolved variable, so the mine's nginx still
   starts when the container is absent (requests then give 502).
3. The BlueGenes tool's `jbrowse2Url` must then be `https://www.<mine>.org/jbrowse2/`.

## 3. Regenerate the config for a new mine release

`docker/config.json` is generated and committed, so builds do not depend on a
mine being reachable. After a mine release (or to add a mine):

```sh
node config/generate.mjs \
  https://www.humanmine.org/humanmine 9606 \
  https://www.flymine.org/flymine 7227 \
  -o docker/config.json
docker compose up -d --build
git add docker/config.json && git commit -m "Regenerate JBrowse 2 config"
```

The generator is described in `config/README.md`. Assembly names
(`humanmine-9606`, `flymine-7227`) must stay stable: the BlueGenes tool
builds URLs from them.

## 4. Updating JBrowse 2

Bump `JBROWSE_VERSION` and `JBROWSE_SHA256` in the `Dockerfile` (and
`JBROWSE_VERSION`/`JBROWSE_SHA256` in `plugin/e2e/run.mjs`), take the digest
from the GitHub release page, update the `@jbrowse/core` range in
`plugin/package.json` if the major changed, and run `npm test`,
`npm run test:e2e` and `docker/smoke-test.sh`.

## 5. Plugin from npm instead of the image

The plugin is plain JavaScript; any JBrowse 2 instance can use it by adding
`{"name": "InterMine", "url": "<bundle url>"}` to `plugins` and the adapters
described in `plugin/README.md`. To publish: `cd plugin && npm run build &&
npm publish` **(you)**; the package is `jbrowse-plugin-intermine`.
