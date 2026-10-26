# Switching HumanMine and FlyMine from /jbrowse2/ to jbrowse2.intermine.org

A one-off change. Today each mine embeds JBrowse 2 from its own sub-path
(`https://www.<mine>.org/jbrowse2/`, "Route B" in `docs/DEPLOY.md`). Afterwards
both embed the shared site `https://jbrowse2.intermine.org/` ("Route A"). The
container is the same one either way (`jbrowse2`, host port 14881); only the
URL that the BlueGenes tool puts in the iframe changes.

Commands use `docker-compose` (the server's Compose); with the Compose plugin,
`docker compose` takes the same arguments.

## 0. Before you start: two preconditions

### 0.1 The hostname works, over HTTPS

The admins' front end must serve `jbrowse2.intermine.org` with a valid
certificate and forward to `dx:14881`:

```nginx
server {
    listen       80;
    server_name  jbrowse2.intermine.org;
    location / {
        proxy_pass http://dx:14881/;
        proxy_redirect default;
    }
}
```

plus TLS termination for that name. Without HTTPS the iframe is blocked:
the mines are `https://`, and browsers refuse `http://` frames inside them.

Check:

      ```sh
      curl -sI https://jbrowse2.intermine.org/ | head -1                                    # 200
      curl -s  https://jbrowse2.intermine.org/ | grep -o '<title>JBrowse</title>'
      curl -s  https://jbrowse2.intermine.org/config.json | head -c 20                      # starts with {
      curl -sI https://jbrowse2.intermine.org/jbrowse-plugin-intermine.umd.production.min.js | head -1   # 200
      ```

      and open in a browser (PAX6 gene models should draw):

      ```
      https://jbrowse2.intermine.org/?assembly=humanmine-9606&loc=11:31786132..31820855&tracks=humanmine-9606-Gene
      https://jbrowse2.intermine.org/?assembly=flymine-7227&loc=2L:7495000..7582000&tracks=flymine-7227-Gene
      ```

      ### 0.2 JBrowse's storage fix is released and deployed

      From `jbrowse2.intermine.org`, the report-page iframe is cross-site. In
      jbrowse-web 4.3.0, visitors whose browser blocks third-party storage
      (Firefox private windows or stricter privacy settings, blocked third-party
      cookies) get "JBrowse Error | SecurityError: The operation is insecure."
      (GMOD/jbrowse-components#5637). It is fixed on JBrowse's `main` branch but
      not released as of October 2026. Do not switch until a release has the fix
      and this repository's image uses it:

      1. Bump `JBROWSE_VERSION` and `JBROWSE_SHA256` in `Dockerfile` and in
         `plugin/e2e/run.mjs` (take the digest from the GitHub release page), and
         the `@jbrowse/core` range in `plugin/package.json` if the major version
         changed (`docs/DEPLOY.md`, "Updating JBrowse 2").
      2. Run the tests: `cd plugin && npm test && npm run build && npm run test:e2e`,
         then `docker/smoke-test.sh` from the repository root.
      3. Commit and push, then on the server:
         ```sh
         cd ~/intermine/docker/jbrowse2 && git pull && docker-compose up -d --build
         ```
      4. Confirm the fix with storage blocked (below, "Check with third-party
         storage blocked"), against the `jbrowse2.intermine.org` URLs above, before
         switching any mine.

 ## 1. Switch a mine (HumanMine shown; FlyMine the same)

      On the server:

      ```sh
      cd ~/intermine/docker/humanmine/data/tools/@intermine/bluegenes-jbrowse2-tool
      cp config.json config.json.bak
      grep jbrowse2Url config.json            # "jbrowse2Url": "https://www.humanmine.org/jbrowse2/",
      sed -i 's#"jbrowse2Url": *"[^"]*"#"jbrowse2Url": "https://jbrowse2.intermine.org/"#' config.json
      grep jbrowse2Url config.json            # "jbrowse2Url": "https://jbrowse2.intermine.org/",
      cd ~/intermine/docker/humanmine && docker-compose restart bluegenes
      ```

      Check that BlueGenes serves the new setting:

      ```sh
      curl -s https://www.humanmine.org/api/tools/all | grep -o '"jbrowse2Url":"[^"]*"'
      # "jbrowse2Url":"https://jbrowse2.intermine.org/"
      ```

      Then reload a gene report page (PAX6:
      https://www.humanmine.org/humanmine/report/Gene/1234788). Check that the
      JBrowse 2 panel draws, and with the browser's developer tools that the
      iframe's address starts with `https://jbrowse2.intermine.org/`.

      The tool's settings reach the browser through `/api/tools/all` on each page
      load, so no cache clearing or version bump is needed for this change. A
      version bump is needed only when `dist/` changes.

      For FlyMine: the same commands in `~/intermine/docker/flymine`, with
      `www.flymine.org` and gene Scr
      (https://www.flymine.org/flymine/report/Gene/1033224).

      ## 2. Check with third-party storage blocked


      This is the case that would break on 4.3.0. In Firefox:
      `about:config`, set `network.cookie.cookieBehavior` to `1`, then open each
      mine's gene page in a normal window. The panel must draw, with no "SecurityError"
      in it. Set the value back to `5` (Firefox's default) afterwards.

      ## 3. Update mine-tests

      In `mine-tests/mines.toml`, change both mines:

      ```toml
      jbrowse2 = "https://jbrowse2.intermine.org/"
      ```

      Then run, and commit and push if all pass:

      ```sh
      pytest tests/service -k jbrowse2
      ./run-browser-tests.sh --browser chromium --browser firefox -k jbrowse
      ```

      `test_query_service_allows_jbrowse2_origin` now really tests cross-site
      access, since the origin differs from the mine's.

      ## 4. Afterwards (optional, no hurry)

      - Keep the `/jbrowse2/` routes for a few weeks. Old links still work, and
        rolling back stays a one-line change.
      - To retire them later: remove `docker-compose.override.yml` in
        `~/intermine/docker/jbrowse2` and run `docker-compose up -d` there. The
        container then leaves the mines' networks, and the template's `/jbrowse2/`
        location answers 502. That location is harmless and can stay in the template.
      - Update `docs/DEPLOY.md` ("Current deployment") and the docker_template
        README's JBrowse table to say the mines use the shared hostname.

      ## Rolling back (per mine)

      ```sh
      cd ~/intermine/docker/humanmine/data/tools/@intermine/bluegenes-jbrowse2-tool
      mv config.json.bak config.json
      cd ~/intermine/docker/humanmine && docker-compose restart bluegenes
      curl -s https://www.humanmine.org/api/tools/all | grep -o '"jbrowse2Url":"[^"]*"'
      # back to https://www.humanmine.org/jbrowse2/
      ```

      and revert the `mines.toml` change. This works only while the `/jbrowse2/`
      route and the network override are still in place (step 4).

      Two points where I'm less certain:
      - The sed line assumes jbrowse2Url is on a single line of config.json. That's how the repo's file is written. The grep before and after shows whether it worked.
      - config.json reaching the page through /api/tools/all is based on the BlueGenes source we read earlier. If the panel still shows the old address after a normal reload, bump the tool's package.json version as for the patched tools.
