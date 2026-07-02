# CICD.md — Multi-project deployment system for a single (eventually multi) DigitalOcean VM

Status: **design / plan**. This document is the source of truth for building the deployment
system. It is written so an implementing agent can build each piece from it. Where a real
value is required (domains, repo URLs) it is marked `<LIKE_THIS>`.

---

## 1. Goal & context

Deploy many independent projects onto one DigitalOcean droplet today, and onto several
droplets later, **without** interactive SSH, without a paid CI service, and without an
orchestrator (no Kubernetes/Swarm yet). Each project is its own Docker Compose "stack",
isolated by its own Docker network. Images live in a **self-hosted registry already running
on the VM** (`<REGISTRY_DOMAIN>`, e.g. `registry.perchlist.com`, grey-clouded so `docker
push` isn't subject to Cloudflare's 100 MB proxied-body limit).

The VM(s) sit **behind Cloudflare's DNS proxy** (orange cloud) except the registry.

Design owner preferences this must respect: lean, self-hosted, no vendor lock-in, owns his
own infra, wants to learn the moving parts. So: small composable pieces, plain Docker
Compose, git as the source of truth.

### Non-goals (for now)
- No Kubernetes / Swarm / Nomad. (See §16 for the upgrade path; the design is chosen so the
  jump to Swarm is cheap when it's actually needed.)
- No load balancer / gateway.
- No paid GitHub Actions usage. Builds happen on the developer's laptop or on a **free
  public-repo** GitHub Action; the deploy path never depends on it.

---

## 2. Core principles

1. **One reconcile engine, many triggers.** "Deploy" = run a reconcile function on a VM.
   A git commit, a timer, a webhook, or a CLI call are all just *triggers* that invoke the
   same engine. We never build a second deploy mechanism — we add doors into the same room.
2. **Git is the source of truth (GitOps-pull).** A single **infra repo** describes what runs
   where. VMs pull it; nothing pushes config into a VM's filesystem ad hoc.
3. **Outbound-only by default.** The build pushes a commit to GitHub (outbound); the VM pulls
   from GitHub (outbound). The one inbound surface is the **webhook**, which is
   authenticated and behind Cloudflare + Caddy.
4. **No interactive SSH for deploys.** Operators trigger deploys via the `deployctl` CLI →
   webhook. SSH remains only for break-glass/bootstrap.
5. **Stacks are isolated.** Each project = its own Compose project on its own private Docker
   network. Only a project's public-facing container also joins the shared `edge-proxy` network.
6. **Idempotent + state-independent.** A reconcile must bring a box to desired state from
   *any* starting state (fresh, stale, half-broken).

---

## 3. High-level architecture

```
            ┌──────────────────────────────── developer laptop ──────────────────────────────┐
            │  docker buildx bake --push   ──────────────►  <REGISTRY_DOMAIN>  (image layers)│
            │  deployctl redeploy <stack> --host vm1   ──┐                                   │
            └────────────────────────────────────────────┼───────────────────────────────────┘
                                                          │ HTTPS POST + Bearer token
                                                          ▼
   GitHub: infra repo (source of truth)         ┌───────────────── VM (droplet) ───────────────┐
   ├─ hosts/<host>.yaml   (host → stacks)       │                                               │
   ├─ groups/<group>.yaml (optional)            │edge-proxy (Caddy, caddy-docker-proxy) :80/:443│
   ├─ stacks/edge-proxy/                        │     │  routes by container labels             │
   ├─ stacks/registry/                          │     ├── deploy.<host>.<DOMAIN> ─► deployctl   │
   ├─ stacks/<project>/docker-compose.yml       │     │                              webhook    │
   └─ agent/ + cli/                             │     ├── <app>.com ─► project web container    │
            │                                   │     └── ...                                   │
            │  git pull (outbound)              │                                               │
            └────────────────────────────────►  │  deployctl (daemon): webhook + reconcile loop │
                                                │     git pull infra → compose pull/up per host │
                                                │                                               │
                                                │  stacks (compose projects, private networks): │
                                                │     registry · perchd · steeple · ...       │
                                                └───────────────────────────────────────────────┘
```

### Components to build
| # | Component | Lives in | Required? |
|---|-----------|----------|-----------|
| A | **Infra repo** layout + host/stack manifests | new git repo | required |
| B | **`edge-proxy`** reverse-proxy stack (prebuilt caddy-docker-proxy image, HTTP-01 TLS) | `stacks/edge-proxy/` | required |
| C | **`deployctl`** binary: reconcile engine + webhook daemon (`serve`) + local CLI | `agent/` (source), `/usr/local/bin` (deployed) | required |
| D | **Webhook receiver** (a mode of C) | part of C | required |
| E | **`deployctl` client** (same binary, client mode) | developer laptop / CI | required |
| F | **Bootstrap** `install.sh` (fresh-VM setup) | `agent/install.sh` | required |
| G | **Secrets** handling (per-VM env, optional SOPS) | `/etc/deployctl/`, repo | required |
| H | **Poll timer** (systemd) for drift/auto-deploy | `agent/*.timer` | recommended |
| I | **Build/release** flow (`docker-bake.hcl`, optional free public Action) | each project repo | required |
| J | **Terraform** provisioning (droplet/firewall/DNS/Spaces) | separate `infra/terraform/` | optional |

---

## 4. The infra repo

A single git repo, separate from app code. App repos build & push *images*; this repo
describes *what runs where*. Suggested name `<USER>/infra`.

```
infra/
├── README.md
├── hosts/
│   ├── vm1.yaml
│   └── vm2.yaml
├── groups/
│   └── web.yaml                 # optional grouping
├── stacks/
│   ├── edge-proxy/
│   │   └── docker-compose.yml   # prebuilt lucaslorentz/caddy-docker-proxy (no custom build)
│   ├── registry/
│   │   └── docker-compose.yml
│   ├── perchd/
│   │   ├── docker-compose.yml
│   │   └── .env.example         # template; the real .env is placed on the VM by hand (see §10)
│   └── steeple/
│       └── docker-compose.yml
├── agent/                       # deployctl source + systemd units + installer
│   ├── deployctl/               # Go module (recommended; see §7.1)
│   ├── deployctl.service
│   ├── deployctl-reconcile.service
│   ├── deployctl-reconcile.timer
│   └── install.sh
└── cli/                         # local config template for the CLI
    └── config.example.yaml
```

The agent reads this repo from a checkout at `<INFRA_DIR>` (default `/opt/infra`) using a
**read-only deploy key**. The repo is pinned to a branch/ref (default `main`).

---

## 5. Host & stack model

### 5.1 Host manifest — `hosts/<host_id>.yaml`
```yaml
# hosts/vm1.yaml
host_id: vm1                 # must match the agent's configured host_id (default = hostname)
groups: [web]                # optional; pulls in stacks from groups/web.yaml
stacks:                      # stacks pinned directly to this host
  - edge-proxy
  - registry
  - perchd
```

### 5.2 Group manifest — `groups/<group>.yaml` (optional)
```yaml
# groups/web.yaml
stacks:
  - steeple
```

### 5.3 Resolution
`assigned(host) = dedup( host.stacks  ∪  ⋃ host.groups[g].stacks )`

The agent computes `assigned(host)` on every reconcile. This is the entire "codify what runs
on which VM / group of VMs" mechanism. Moving a project to another box = edit one yaml line.

### 5.4 Stack layout contract — `stacks/<stack>/docker-compose.yml`
Every stack:
- Has Compose project name == stack name (set `name:` at top, or rely on directory name).
- Declares the shared `edge-proxy` network as **external** (only if it serves HTTP).
- Puts its private services (db, cache) on a `<stack>-net` network, **never** on `edge-proxy`.
- References images as `<REGISTRY_DOMAIN>/<image>:<tag>`.
- Public web container carries Caddy routing **labels** (see §6.3).

Image tag strategy (pick one per stack, both supported):
- **Pinned** (`:0.3.1`): GitOps-friendly. A build bumps the tag in this file and commits →
  the poll timer (H) auto-deploys. Enables clean rollback (`git revert`).
- **Moving** (`:latest`): deploy by calling the webhook with a hard recreate (`--pull always`)
  so the running container is replaced by whatever `:latest` now points to. Optionally the
  agent can auto-redeploy when the registry digest changes (see §7.5).

---

## 6. `edge-proxy` reverse-proxy stack (component B)

Replaces the current pattern where Caddy is embedded inside the `perchd` compose project and
routes are hand-edited in one Caddyfile. Now Caddy is its own stack and **routing config
lives as labels on each project's container** — adding a project requires editing nothing
shared.

Uses [`lucaslorentz/caddy-docker-proxy`](https://github.com/lucaslorentz/caddy-docker-proxy):
Caddy watches the Docker socket (read-only) and rebuilds its config from container labels.

### 6.1 Image — use the published `caddy-docker-proxy` (no custom build)
Just use the prebuilt image `lucaslorentz/caddy-docker-proxy:2-alpine`. No xcaddy build, no
plugins. Certs are issued via **HTTP-01** over port 80 — the same automatic-HTTPS path the
current hand-written Caddyfile already uses, which works through Cloudflare's proxy.

> You only need a custom build if you later want **DNS-01** (for wildcard certs, or if a
> Cloudflare "Always Use HTTPS"/redirect rule starts breaking HTTP-01). That path adds the
> `caddy-dns/cloudflare` plugin + a scoped `CF_API_TOKEN` — see §6.5. Deferred; not needed to start.

### 6.2 `stacks/edge-proxy/docker-compose.yml`
```yaml
name: edge-proxy
services:
  caddy:
    image: lucaslorentz/caddy-docker-proxy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    environment:
      CADDY_INGRESS_NETWORKS: edge-proxy
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - caddy-data:/data                      # ACME certs — persist this
      - caddy-config:/config
    labels:
      caddy.email: <ACME_EMAIL>               # global Let's Encrypt account email
    networks: [edge-proxy]
volumes:
  caddy-data:
  caddy-config:
networks:
  edge-proxy:
    external: true                            # created once at bootstrap: docker network create edge-proxy
```

The ACME email is set by the `caddy.email` label above — no separate Caddyfile and no API
token needed. Caddy's automatic HTTPS handles issuance and renewal on its own.

### 6.3 Per-project routing via labels
On a project's public web service (it must be on the `edge-proxy` network):
```yaml
services:
  web:
    image: <REGISTRY_DOMAIN>/steeple:latest
    networks: [edge-proxy, steeple-net]
    labels:
      caddy: steeple.com
      caddy.reverse_proxy: "{{upstreams 8080}}"
  postgres:
    networks: [steeple-net]                 # never on edge-proxy
networks:
  edge-proxy: { external: true }
  steeple-net: {}
```

The existing `perchd` Caddyfile (web/api/admin/telemetry/registry blocks) translates 1:1 to
labels. Tricky ones to port (give the implementer these examples):
- **basic auth**: `caddy.basic_auth.<user>: <bcrypt-hash>` (or a `basic_auth` directive block
  via `caddy.0_basic_auth` ordered labels).
- **registry**: `caddy.request_body.max_size: 10GB`, header labels, and basic_auth — same
  pattern, on the `registry` service.
- **header_up / host rewrite** (loki/telemetry): `caddy.reverse_proxy.header_up: "Host localhost"`.

### 6.4 TLS / Cloudflare
- App domains: orange-clouded. Caddy issues real Let's Encrypt certs via **HTTP-01** (port 80),
  which Cloudflare's proxy forwards to the origin — the same path the current Caddyfile uses.
  Set Cloudflare SSL mode to **Full (strict)**.
- Registry: grey-clouded (direct A record) — keep as today.
- Persist `caddy-data` volume so certs survive redeploys (avoid LE rate limits).

### 6.5 (Optional, later) DNS-01 for wildcards
Only if you want a wildcard cert, or a Cloudflare "Always Use HTTPS"/redirect rule starts
breaking HTTP-01: rebuild the edge-proxy image with `xcaddy ... --with github.com/caddy-dns/cloudflare`,
add a scoped `CF_API_TOKEN` (DNS:Edit on the zones) to the edge-proxy `.env`, and set a global
`acme_dns cloudflare {env.CF_API_TOKEN}`. Not needed to start; nothing else in this doc depends
on it.

---

## 7. `deployctl` — the agent (components C, D, E)

One binary, three roles. **Recommended language: Go** — single static binary, trivial systemd
deployment, no runtime on the VM, easy cross-compile from the laptop. (Implementer may choose
otherwise; the contracts below — CLI surface §7.4, webhook API §8 — are language-agnostic.
Flag this as an open decision in §17.)

Roles:
- **`deployctl serve`** — long-running daemon on the VM: webhook HTTP server + (optionally)
  the in-process reconcile loop.
- **`deployctl reconcile|redeploy ...`** run **on the VM** (no `--host`) — executes the engine
  locally. Used by the systemd timer and by `install.sh` for first bring-up.
- **`deployctl reconcile|redeploy ... --host/--group ...`** run **on the laptop/CI** — acts as
  a *client*: POSTs to the target VM's webhook (see §7.4 / §8).

### 7.1 Agent config — `/etc/deployctl/config.yaml`
```yaml
infra_repo: git@github.com:<USER>/infra.git
infra_ref: main
infra_dir: /opt/infra
host_id: vm1                 # default: os.Hostname(); selects hosts/<host_id>.yaml
registry: <REGISTRY_DOMAIN>
listen: 127.0.0.1:9000       # webhook bind; Caddy proxies deploy.<host>.<DOMAIN> → here
state_file: /var/lib/deployctl/state.json
lock_file: /run/deployctl.lock
job_log_dir: /var/lib/deployctl/jobs
```
Secrets via systemd `EnvironmentFile=/etc/deployctl/env` (chmod 600): just `DEPLOY_TOKEN` (the
webhook password). Registry auth via `docker login` at bootstrap (creds in
`/root/.docker/config.json`) so `compose pull` works.

### 7.2 State file — `/var/lib/deployctl/state.json`
```json
{
  "applied_sha": "<git-sha>",
  "running_stacks": ["edge-proxy", "registry", "perchd"],
  "last_job": { "id": "...", "stack": "perchd", "mode": "hard", "ok": true, "finished_at": "..." }
}
```
`running_stacks` is needed to tear down **deassigned** stacks (a stack removed from the host
manifest must be `compose down`-ed).

### 7.3 Reconcile engine (the heart)
Pseudocode — this is the single function every trigger calls:
```
reconcile(targets, mode):                       # targets = ["all"] or explicit stack names
  flock(lock_file)                              # serialize; if held, queue or return 409
  try:
    git -C INFRA_DIR fetch --prune
    git -C INFRA_DIR reset --hard origin/INFRA_REF   # exact desired state, no local drift
    sha = git rev-parse HEAD

    assigned = resolveAssignedStacks(host_id)   # §5.3, from hosts/ + groups/
    if targets == ["all"]:
        toApply = assigned
    else:
        toApply = targets ∩ assigned            # reject stacks not assigned to this host (404)
        if targets - assigned: record warning / 404 for the unknown ones

    for stack in toApply:
        dir   = INFRA_DIR/stacks/stack
        env   = stacks/<stack>/.env             # §10: plain file on the VM, gitignored (if present)
        composeFile = dir/docker-compose.yml
        run: docker compose -p stack -f composeFile --env-file <env> pull
        switch mode:
          gentle:      docker compose ... up -d --remove-orphans
          hard:        docker compose ... up -d --force-recreate --pull always
          sledgehammer:docker compose ... down  &&  docker compose ... up -d
        verify: docker compose ... ps  (optionally wait for healthy; fail job if not)

    for stack in state.running_stacks - assigned:     # declarative removal
        docker compose -p stack -f .../docker-compose.yml down     # NEVER -v (keeps volumes)

    state.applied_sha   = sha
    state.running_stacks = assigned
    persist(state)
  finally:
    unflock()
```
Notes:
- `git reset --hard origin/<ref>` (not `pull`) guarantees the checkout is exactly desired
  state even if something locally diverged. Safe because the checkout is machine-owned.
- `down` never uses `-v`: named volumes (Postgres data) must survive. Document this loudly.
- Modes: **gentle** (timer / commit-driven, minimal churn), **hard** (default for the webhook
  "redeploy now" button — fresh pull + recreate, low downtime), **sledgehammer** (full
  down+up for a wedged stack).

### 7.4 CLI surface
```
# On the VM (local execution):
deployctl serve                              # run the daemon (systemd ExecStart)
deployctl reconcile                          # gentle reconcile of all assigned stacks
deployctl redeploy <stack> [--hard|--sledgehammer]
deployctl redeploy --all [--hard]

# From laptop / CI (client mode — targets remote webhook):
deployctl redeploy <stack> --host vm1 [--hard] [--wait]
deployctl redeploy <stack> --group web [--wait]      # fan out to all hosts in group
deployctl reconcile --host vm1
deployctl status <job-id> --host vm1
deployctl hosts                              # print configured hosts/groups from client config
```

### 7.5 Optional: digest-poll auto-redeploy
On each timer tick, for each assigned stack using a moving tag, compare the **running image
digest** to the registry's current digest for that tag; if changed, run a hard redeploy. This
auto-deploys "I re-pushed `:latest`" with zero trigger. Mark optional; off by default.

---

## 8. Webhook API (component D)

Served by `deployctl serve` on `listen` (127.0.0.1:9000), exposed publicly **only** through
the `edge-proxy` Caddy at `deploy.<host>.<DOMAIN>` (orange-clouded). All action endpoints require
auth. Execution is **asynchronous**: return a job id immediately, run reconcile in the
background, log to journald + `job_log_dir/<id>.log`.

| Method & path | Auth | Body | Behaviour | Response |
|---|---|---|---|---|
| `GET /healthz` | none | — | liveness | `200 ok` |
| `POST /v1/reconcile` | yes | `{}` | gentle reconcile of all assigned stacks | `202 {job_id}` |
| `POST /v1/redeploy/{stack}` | yes | `{"mode":"hard"}` (default `hard`) | redeploy one stack | `202 {job_id}` |
| `POST /v1/redeploy` | yes | `{"stacks":[...],"mode":"hard"}` | redeploy several | `202 {job_id}` |
| `GET /v1/jobs/{id}` | yes | — | job status + tail of log | `200 {status,ok,log_tail}` |

Status codes: `401` bad/missing token; `404` unknown or unassigned stack; `409` busy (lock
held) — client may retry; `500` engine error (details in job log).

### 8.1 Auth
- **Bearer token** (default): `Authorization: Bearer <DEPLOY_TOKEN>`. Token is a per-VM random
  ≥32-byte secret in `/etc/deployctl/env`. **Constant-time** comparison.
- Optionally also accept **GitHub-style HMAC** (`X-Hub-Signature-256`, sha256 over raw body
  with a shared secret) so a GitHub repo webhook can call it natively. Implement bearer first.
- Defense in depth (recommended): put **Cloudflare Access** in front of `deploy.<host>.<DOMAIN>`,
  or restrict by Cloudflare WAF. The bearer token is the security boundary regardless.

### 8.2 Input safety (critical)
The `{stack}` value is attacker-influenceable. It must be matched against `assigned(host)`
(an allowlist) and used only to select a known `stacks/<stack>/` directory. **Never**
interpolate it into a shell string. Reject anything not in the allowlist with `404`.

---

## 9. `deployctl` client config (component E)

On the laptop / in CI: `~/.config/deployctl/config.yaml`
```yaml
hosts:
  vm1:
    url: https://deploy.vm1.<DOMAIN>
    token: <DEPLOY_TOKEN_FOR_VM1>            # or token_env: VM1_DEPLOY_TOKEN
  vm2:
    url: https://deploy.vm2.<DOMAIN>
    token_env: VM2_DEPLOY_TOKEN
groups:
  web: [vm1, vm2]
```
`--group web` fans out the same request to every host in the group (sequentially or
concurrently; report per-host result). In CI, read tokens from secrets via `token_env`.

---

## 10. Secrets (component G) — plain files on the VM

Keep it simple: **secrets are plain `.env` files that live on the server, never in git.** No
keys, no encryption, no extra tools. You set them once per VM and then forget them — deploys
never upload secrets.

Three kinds:

1. **Agent secret** (`/etc/deployctl/env`, chmod 600, placed at bootstrap): just `DEPLOY_TOKEN`,
   the webhook password. Generate once (`openssl rand -hex 32`), drop it on the VM, and put the
   same value in your laptop's deployctl config (§9).
2. **Per-stack app secrets** (DB passwords, API keys): a plain `stacks/<stack>/.env` placed on
   the VM by hand, e.g. `DB_PASSWORD=...`. The compose file reads it (`env_file: .env`) and the
   engine passes `--env-file`. **git-ignore it** (`*/.env` in the infra repo's `.gitignore`) so
   it's never committed. Commit a `.env.example` with blank values so each stack's needs are clear.
3. **Registry login**: `docker login <REGISTRY_DOMAIN>` once at bootstrap.

You set these **once per VM** (and again only when a password changes). After that the server
pulls compose files from git and reads secrets from the local `.env` — nothing to upload on a
deploy. Keep a copy of each `.env` in your password manager so a rebuilt VM is easy to restore.

> **Optional, much later:** if you ever want secrets *backed up and version-controlled in git*
> (so rebuilding a dead VM is push-button), encrypt them with
> [SOPS](https://github.com/getsops/sops)+age and commit the ciphertext, with one age key on
> each VM to decrypt. It's pure convenience over the plain-file approach — skip it until copying
> `.env` files around actually becomes a chore.

---

## 11. Build & release flow (component I)

Building is decoupled from deploying. Build wherever is free; deploy via webhook.

### 11.1 Build (unchanged tooling — keep `docker buildx bake`)
Each project repo keeps its `docker-bake.hcl` + `versions.hcl` and builds to the registry:
```
docker buildx bake -f docker-bake.hcl -f versions.hcl --push
```
**Where to build** (no paid CI required):
- **Laptop** — status quo, zero infra, fine for a POC.
- **Free public-repo GitHub Action** — public repos get unlimited standard-runner minutes
  (4 vCPU / 16 GB / ~14 GB disk; 6 h/job). Legitimate **only when the workflow builds that
  repo's own software**. Caveats the implementer must honor: public Actions logs are world-
  readable and secret masking is *not* guaranteed → use fine-grained least-privilege tokens,
  never echo secrets; the ~14 GB disk is tight for a 3.5 GB image → free disk at job start.
  Do **not** put a self-hosted runner on a public repo (PR authors can run code on it).
- A **private** repo Action falls back to the Free plan's 2,000 min/month — enough for
  *deploy* triggers; avoid for heavy *builds*.

> The "one public repo that pulls in unrelated private repos to farm free minutes" idea is
> **disallowed** by GitHub's Actions terms ("any other activity unrelated to the … software
> project associated with the repository"). Don't build the system around it.

### 11.2 Trigger a deploy after a build — two patterns (both supported)
- **On-demand (primary):** after `--push`, call the webhook:
  ```
  deployctl redeploy <stack> --host vm1 --hard
  # or raw: curl -fsS -X POST https://deploy.vm1.<DOMAIN>/v1/redeploy/<stack> \
  #              -H "Authorization: Bearer $DEPLOY_TOKEN"
  ```
- **GitOps (optional, via timer H):** bump the pinned image tag in
  `stacks/<stack>/docker-compose.yml` and commit to the infra repo. The poll timer reconciles
  on the next tick. Gives free audit trail + `git revert` rollback.

A GitHub Action `deploy.yml` ties these together: `bake --push` → then either the `deployctl`
client call (needs `DEPLOY_TOKEN` secret) or a commit to the infra repo (needs a deploy key).

---

## 12. Bootstrap a fresh VM (component F) — `agent/install.sh`

The acknowledged manual step. Make it a single idempotent script (runnable by hand, by
cloud-init, or as Terraform `user_data`). Steps:

1. Install Docker Engine + compose plugin.
2. `docker network create edge-proxy` (idempotent: ignore "already exists").
3. Install the `deployctl` binary to `/usr/local/bin/deployctl` (download a release artifact
   or `go build`).
4. Write `/etc/deployctl/config.yaml` (§7.1) and `/etc/deployctl/env` (just `DEPLOY_TOKEN`, chmod 600).
5. Install the infra-repo **read-only deploy key**; clone `infra_repo` to `infra_dir`.
6. `docker login <REGISTRY_DOMAIN>` (registry creds), and drop each assigned stack's
   `stacks/<stack>/.env` secrets file into the checkout (gitignored, chmod 600; values copied
   from your password manager — §10).
7. Set the host's identity: ensure `hosts/<host_id>.yaml` exists in the repo; `host_id`
   defaults to the machine hostname.
8. Install systemd units:
   - `deployctl.service` → `ExecStart=/usr/local/bin/deployctl serve` (the webhook daemon).
   - `deployctl-reconcile.service` (oneshot) + `deployctl-reconcile.timer` (e.g.
     `OnUnitActiveSec=90s`) for the optional poll path (H).
   - `systemctl enable --now deployctl.service deployctl-reconcile.timer`.
9. First bring-up: `deployctl reconcile` (locally) → starts `edge-proxy` + assigned stacks.
10. Create DNS: `deploy.<host>.<DOMAIN>` (orange) → VM; app domains per project; registry
    grey-clouded.

`systemd unit sketch` — `deployctl.service`:
```ini
[Unit]
Description=deployctl webhook + reconcile daemon
After=docker.service
Requires=docker.service
[Service]
EnvironmentFile=/etc/deployctl/env
ExecStart=/usr/local/bin/deployctl serve
Restart=on-failure
[Install]
WantedBy=multi-user.target
```

> The agent runs as root (or a docker-group user): it can run any compose in the repo. That
> privilege is exactly why the webhook auth (§8.1) is the security boundary.

---

## 13. Security model

| Surface | Threat | Mitigation |
|---|---|---|
| Webhook (internet-facing) | Unauthorized deploy / RCE-by-proxy | Bearer token ≥32 B, constant-time compare; behind Cloudflare (+ optional Access); only `POST`; rate-limit |
| Webhook input `{stack}` | Path traversal / command injection | Allowlist against `assigned(host)`; select dir only; never shell-interpolate |
| Infra repo access | Leak/alter desired state | Read-only deploy key on VM; protected branch; review commits |
| Registry | Anonymous pulls/pushes | Basic auth; grey-cloud (no CF body-limit); TLS |
| Secrets at rest | Disk theft / repo leak | Plain `.env` on the VM (chmod 600), git-ignored so never committed; never baked into images |
| Public-repo CI logs | Secret leak in world-readable logs | Fine-grained tokens; never echo; no self-hosted runner on public repo |
| docker.sock | Container escape | Mounted `:ro` to edge-proxy Caddy only; agent holds the write access it needs |
| Cloudflare token (only if you opt into DNS-01, §6.5) | Zone takeover if leaked | Scope to DNS:Edit on the specific zones; not used in the default HTTP-01 setup |

---

## 14. Operations

- **Rollback:** pinned tags → `deployctl redeploy <stack> --host vmX` after setting the prior
  tag (or `git revert` in the infra repo + reconcile). Keep `caddy-data` so certs persist.
- **Logging:** agent → journald; per-job logs in `job_log_dir`; `GET /v1/jobs/{id}` returns a
  tail. Keep the existing Loki/Promtail as a `telemetry` stack if cross-stack logs are wanted.
- **Health:** reconcile optionally waits for `compose ps`/healthchecks and fails the job if a
  stack doesn't come healthy (so a bad deploy is visible, not silently "202 OK").
- **Drift correction:** the poll timer re-applies desired state each tick (catches manual
  fiddling, crashed containers).
- **Downtime:** `hard` (force-recreate) ≈ seconds per container; `sledgehammer` (down+up) has
  a real gap. Stateful single-instance stacks will blip — acceptable for a POC.
- **Concurrency:** `flock` serializes reconciles per VM; the webhook returns `409` if busy.

---

## 15. Implementation checklist (ordered)

Build in this order; each item is independently testable.

1. **Infra repo skeleton** (§4–5): `hosts/`, `groups/`, `stacks/`, a host manifest for the
   current VM. Move `perchd` into `stacks/perchd/` (compose only, no Caddy).
2. **`edge-proxy` stack** (§6): compose using the prebuilt `lucaslorentz/caddy-docker-proxy`
   image (no custom build); `docker network create edge-proxy`; port `perchd`'s Caddyfile routes to
   labels on `perchd`'s web service. Verify HTTPS (HTTP-01) cert issuance behind Cloudflare.
3. **`deployctl` reconcile engine** (§7.3) as a local CLI: `reconcile`, `redeploy`,
   host/group resolution (§5.3), state file (§7.2), flock. Test on the VM by hand.
4. **Webhook daemon** (§8): `serve`, async jobs, bearer auth, input allowlist, `/healthz`,
   `/v1/jobs/{id}`. Expose via `edge-proxy` at `deploy.<host>.<DOMAIN>`.
5. **Client mode** (§7.4, §9): `--host`/`--group` → POST to webhook; `--wait` polls job
   status; client config file.
6. **Secrets** (§10): per-stack `.env` files placed on the VM, git-ignored; commit `.env.example` templates.
7. **Bootstrap `install.sh`** (§12) + systemd units; run end-to-end on a fresh droplet.
8. **Poll timer** (§7.x, H): wire `deployctl-reconcile.timer`.
9. **Build/release** (§11): keep `bake`; add a `justfile`/Action step that builds, pushes,
   then triggers `deployctl redeploy … --host …`.
10. **Migrate `steeple`** into `stacks/steeple/` using the same pattern.
11. (Optional) digest-poll auto-redeploy (§7.5); Cloudflare Access on the webhook; Terraform
    provisioning (§J).

---

## 16. Scaling path (why this design defers Kubernetes)

This is chosen so growth is cheap and incremental:
- **VM #2, projects pinned to boxes:** add `hosts/vm2.yaml`, point each project's DNS at the
  right box. No orchestrator. The host/stack model already supports it.
- **Same service across VMs behind a LB:** put Cloudflare LB / DO LB / HAProxy in front of N
  **stateless** VMs each running the stack via compose; externalize state (managed Postgres).
  A load balancer does **not** require Kubernetes.
- **Want orchestrator features** (auto-scheduling, self-healing, rolling deploys): adopt
  **Docker Swarm** first — the `edge-proxy` label-routing + external-network + stateless-service
  design here maps directly onto Swarm (`docker stack deploy`, caddy-docker-proxy has a Swarm
  mode). Reach for Nomad/Kubernetes only as a deliberate choice, not a scaling necessity.
- **Or adopt [Komodo](https://komo.do)** at VM #2: it is this exact model productized
  (git-defined compose stacks, per-server agent, redeploy webhooks). `deployctl` is a
  miniature of it, so the infra repo carries over unchanged.

---

## 17. Open decisions to confirm before implementing

1. **Agent language** — recommended Go (static binary). Confirm, or choose .NET/Python.
2. **Webhook execution** — async + job log (spec'd) vs simple synchronous-with-timeout. Async
   recommended because `compose pull` of large images is slow.
3. **Per-stack secrets** — *decided:* plain `.env` files on the VM, git-ignored (§10).
   Encrypted-in-git (SOPS) deferred as an optional later upgrade.
4. **Webhook exposure** — bearer token only, or also Cloudflare Access in front?
5. **Real values** — `<DOMAIN>`, `<REGISTRY_DOMAIN>`, infra repo URL, `<ACME_EMAIL>`, host ids,
   and which projects ship first (`perchd`, `steeple`).
6. **Where this lives** — this doc is in the `steeple` repo for now; the infra repo + agent
   code should ultimately live in the dedicated `infra` repo (§4).
```
