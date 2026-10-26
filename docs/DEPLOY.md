# Deploying JBrowse 2 for InterMine

What runs: one nginx container (`jbrowse2`) serving jbrowse-web, the
`jbrowse-plugin-intermine` bundle and a generated `config.json`. Like the
JBrowse 1 container it holds no data and never talks to a mine; each
visitor's browser reads genome data from the mine's `service/jbrowse`
endpoints (CORS is open on them). JBrowse 1 keeps running alongside, because
the classic webapp and other sites use it.

**Current deployment (October 2026):** HumanMine and FlyMine, by Route B
below (`https://www.<mine>.org/jbrowse2/`), container on host port 14881
(JBrowse 1 is on 14880). Both mines' gene report pages show only the JBrowse 2
panel. Route A (`jbrowse2.intermine.org`) and npm publishing are not done.

Steps that need the maintainer or the front-end admins are marked **(you)**.

**`docker-compose` or `docker compose`.** The commands below use
`docker-compose`, the standalone Compose binary, because that is what the
current production server has (v2.12.0). Newer installations should use
`docker compose` (the Compose plugin for the Docker CLI) instead: the
arguments are the same.

## 1. Build and start

```sh
git clone https://github.com/intermineorg/jbrowse2.git ~/intermine/docker/jbrowse2
cd ~/intermine/docker/jbrowse2
cp .env.example .env            # optional: change JBROWSE2_HTTP_PORT (default 14881)
docker-compose up -d --build
docker ps --filter name=jbrowse2 --format '{{.Names}} {{.Status}}'   # ... (healthy)
curl -s http://localhost:14881/config.json | head -c 200
```

To undo: `docker-compose down` in that directory (the mines are not
affected; any `/jbrowse2/` route on them then answers 502).

The last command ends with `(23) Failed writing body`: that is only curl
noticing that `head` stopped reading after 200 bytes, and is harmless. To
check the whole file is valid JSON instead:
`curl -s http://localhost:14881/config.json | python3 -m json.tool > /dev/null && echo valid`.

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

[See SWITCH-TO-jbrowse2.intermine.org.md for details of how to switch from Route B to Route A
once jbrowse2.intermine.org is up]

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
   your mines' networks, `docker-compose up -d`. To undo: delete
   `docker-compose.override.yml` and run `docker-compose up -d` again.
2. In each mine's front end (docker_template's `nginx/nginx.conf.template`,
   beside `/jbrowse/`). docker_template includes this location from commit
   03b5411 ("nginx: optional /jbrowse2/ route"): with a mine directory
   updated past that, skip the edit and only rebuild nginx (step 3). For an
   older copy, add:

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
3. Rebuild, test and restart each mine's nginx (below).
4. The BlueGenes tool's `jbrowse2Url` must then be `https://www.<mine>.org/jbrowse2/`.
   Install it and add it to the mine's report page layout as described in
   `bluegenes-tool/README.md`.
5. Check the deployment with
   [intermineorg/mine-tests](https://github.com/intermineorg/mine-tests): set
   `jbrowse2` for the mine in its `mines.toml` and list
   `bluegenesJBrowse2Tool` under `tools.rendered`, then
   `pytest tests/service -k jbrowse2 --mine <mine>` and
   `./run-browser-tests.sh --browser chromium --mine <mine> -k jbrowse`.

#### Restarting and testing a mine's nginx after editing its config

In docker_template the nginx config is a template that is copied into the
nginx *image* at build time (`nginx/nginx.Dockerfile`) and rendered with
`envsubst` when the container starts. Restarting the container is therefore
not enough: rebuild the image. Test the new config before replacing the
running container, because a broken config leaves the mine's nginx
restarting in a loop and the whole site down. For HumanMine (FlyMine the
same in its own directory):

```sh
cd ~/intermine/docker/humanmine
cp nginx/nginx.conf.template nginx/nginx.conf.template.bak   # before editing

# 1. build the image with the edited template; the running site is unaffected
docker-compose build nginx

# 2. test it in a throwaway container, which renders the template exactly as
#    the real one will; expect "syntax is ok" and "test is successful"
docker-compose run --rm --no-deps nginx nginx -t

# 3. replace the running container (a second or two of downtime)
docker-compose up -d nginx

# 4. check
docker ps --filter name=humanmine_nginx --format '{{.Names}} {{.Status}}'
curl -sI https://www.humanmine.org/jbrowse2/ | head -1   # 200
curl -sI https://www.humanmine.org/jbrowse/  | head -1   # JBrowse 1 unaffected
curl -sI https://www.humanmine.org/          | head -1   # BlueGenes unaffected
```

The container is named `${MINE}${INSTANCE}_nginx` (`humanmine_nginx` when
`INSTANCE` is empty in the mine's `.env`). If step 2 fails, fix the template
and repeat from step 1; the live site is still running the old config. A 502
from `/jbrowse2/` means nginx is fine but cannot reach the JBrowse 2
container: check step 1 (the override file and `docker-compose up -d` in
`~/intermine/docker/jbrowse2`) and that `docker ps` shows `jbrowse2` running.

To undo: restore `nginx/nginx.conf.template.bak` and repeat steps 1 to 3.

These steps follow the current docker_template on GitHub; if a mine
directory is an older copy, check the `nginx:` service in its
`docker-compose.yml` first.

## 3. Regenerate the config for a new mine release

`docker/config.json` is generated and committed, so builds do not depend on a
mine being reachable. After a mine release (or to add a mine):

```sh
node config/generate.mjs \
  https://www.humanmine.org/humanmine 9606 \
  https://www.flymine.org/flymine 7227 \
  -o docker/config.json
docker-compose up -d --build
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
