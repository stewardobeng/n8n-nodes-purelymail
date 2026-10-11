# Installing this node

This package is a community node, so it runs on **self-hosted n8n**. n8n Cloud does not allow
community nodes.

## Option 1: from the n8n interface, by name (recommended)

1. Open n8n and go to **Settings > Community Nodes**.
2. Select **Install**.
3. Enter `n8n-nodes-purelymail` and confirm.
4. Restart n8n if it asks.

n8n downloads the package from npm and installs it into `~/.n8n/nodes`. Updates appear in the same
screen, and a restart of n8n picks them up.

## Option 2: from a tarball, without a registry

Useful when the machine cannot reach npm, or when you want to install a build that is not published.

```bash
mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes
npm install --no-audit --no-fund --legacy-peer-deps /path/to/n8n-nodes-purelymail-0.1.0.tgz
# then restart n8n
```

`--legacy-peer-deps` matters: `n8n-workflow` is declared as a peer because n8n supplies it at
runtime. A plain install tries to fetch it from the registry and can fail while building its native
dependencies. The published package has **no runtime dependencies**, so nothing else needs fetching.

## Option 3: by name, from the shell (Docker or bare metal)

```bash
# bare metal, in the n8n user's home
cd ~/.n8n/nodes && npm install --no-audit --no-fund --legacy-peer-deps n8n-nodes-purelymail

# Docker, into a mounted volume
docker exec -u node <container> sh -lc \
  'cd /home/node/.n8n/nodes && npm install --no-audit --no-fund --legacy-peer-deps n8n-nodes-purelymail'
docker restart <container>
```

## Option 4: baked into a Docker image

```dockerfile
FROM n8nio/n8n:latest
USER root
RUN cd /usr/local/lib/node_modules/n8n && \
    npm install --no-audit --no-fund --legacy-peer-deps n8n-nodes-purelymail
USER node
```

This survives container recreation, which the volume approach also does, but it pins the version into
the image, so an update means rebuilding the image.

## After installing

1. Create a **Purelymail API** credential and paste your API token.
2. Add a **Purelymail** node to a workflow.
3. Run **Billing > Check Credit** first. It is the cheapest way to prove the credential works, and it
   is important here because Purelymail answers HTTP 200 even for a rejected call, so n8n's own
   connection test cannot tell you whether the key is valid.

## Removing it

Uninstall from **Settings > Community Nodes**, or delete the folder under `~/.n8n/nodes` and restart.
