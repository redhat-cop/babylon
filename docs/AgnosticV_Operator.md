# agnosticv-operator

## Locks

Quick gist (grounded in code):

* **Repo lock** = object-level lock on an `AgnosticVRepo` instance; used by the webhook handlers to serialize high-level repo work like `manage_components(...)` and single-PR processing. 
* **Git lock** = `git_repo_lock`; guards *all* clone/fetch/checkout and component listing to avoid concurrent git operations.
* **PR lock** = per-PR lock from `get_pr_lock(pr_number)`; prevents races between webhook PR processing and polling/cleanup touching the same PR.

### 1) Repo lock (high-level orchestration on webhooks)

```mermaid
sequenceDiagram
    participant GH as GitHub
    participant WH as WebhookServer
    participant R as AgnosticVRepo
    participant RL as Repo Lock (R.lock)

    GH->>WH: push / pull_request webhook
    WH->>WH: verify signature + match repo
    alt push event
        WH->>R: trigger_repo_update(changed_only=True, skip_pr_processing=True)
        activate RL
        WH->>RL: acquire R.lock
        RL->>R: manage_components(...)
        R-->>RL: done
        deactivate RL
    else PR opened/reopened/synchronize
        WH->>R: manage_single_pr
        activate RL
        WH->>RL: acquire R.lock
        RL->>R: manage_single_pr(...)
        R-->>RL: done
        deactivate RL
    else PR closed
        WH->>R: cleanup (remove PR metadata, maybe main sync)
        activate RL
        WH->>RL: acquire R.lock
        RL->>R: cleanup / optional main sync
        R-->>RL: done
        deactivate RL
    end
```

*(Repo lock via `async with agnosticv_repo.lock:` in webhook paths; push uses `manage_components(..., skip_pr_processing=True)`, PR events call single-PR/cleanup paths.)*   

### 2) Git lock (protect all git operations)

```mermaid
sequenceDiagram
    participant P as Poller / Worker
    participant R as AgnosticVRepo
    participant GL as Git Lock (git_repo_lock)
    participant G as Local git repo

    P->>R: git_repo_sync()
    activate GL
    P->>GL: acquire git_repo_lock
    GL->>G: clone or fetch + checkout
    G-->>GL: updated worktree
    deactivate GL

    Note over R,GL: Any code that lists components or swaps branches also runs under git_repo_lock

    P->>R: _agnosticv_get_all_component_paths_no_lock()
    activate GL
    P->>GL: acquire git_repo_lock
    GL->>G: ensure on main ref, list components
    G-->>GL: component paths
    deactivate GL
```

*(Locking in `git_repo_sync(...)` and component listing/checkout paths; “no_lock” internals are only called while holding `git_repo_lock`.)*  

### 3) PR lock (per-PR race-free processing)

```mermaid
sequenceDiagram
    participant WH as WebhookServer
    participant R as AgnosticVRepo
    participant RL as Repo Lock (R.lock)
    participant PL as PR Lock (get_pr_lock)
    participant GL as Git Lock (git_repo_lock)

    WH->>R: manage_single_pr(pr, head_ref, head_sha)
    activate RL
    WH->>RL: acquire R.lock
    RL->>R: get_pr_lock
    activate PL
    R->>PL: acquire PR-specific lock
    activate GL
    PL->>GL: acquire git_repo_lock
    GL->>R: fetch PR branch / checkout SHA / diff files
    deactivate GL
    PL->>R: create/update/delete components, annotate used-by-prs
    deactivate PL
    deactivate RL
```

*(`manage_single_pr` wraps work in `get_pr_lock(pr_number)`; inside that, git work is still protected by `git_repo_lock`. Cleanup paths also use PR locks before mutating annotations/deletions for a given PR.)*   

### 4) Which locks fire for which actions (order of acquisition)

```mermaid
flowchart TB
    A[push webhook] -->|signature ok| L1[Acquire Repo lock]
    L1 --> M1[manage_components, changed_only, skip_pr_processing]
    M1 -->|git ops| GL1[Acquire Git lock] --> Done1[Release Git then Repo]

    B[PR opened/reopened/synchronize] --> L2[Acquire Repo lock]
    L2 --> PL2[Acquire PR lock ]
    PL2 -->|git ops| GL2[Acquire Git lock]
    GL2 --> Work2[Checkout PR ref, compute changes, apply components]
    Work2 --> Release2[Release Git -> PR -> Repo]

    C[PR closed] --> L3[Acquire Repo lock]
    L3 --> Clean[Cleanup PR metadata, maybe main-branch sync]
    Clean -->|git ops| GL3[Acquire Git lock]
    GL3 --> Release3[Release Git -> Repo]

    D[Periodic poll/tick] --> GL4[Acquire Git lock]
    GL4 --> PollWork[fetch/clone, list components, optional PR scanning]
    PollWork --> Release4[Release Git]
```

side-by-side view that shows **webhook** vs **polling** paths and how they contend for the three locks.

```mermaid
sequenceDiagram
    autonumber
    participant GH as GitHub
    participant WH as WebhookServer
    participant P as Poller/Worker
    participant R as AgnosticVRepo
    participant RL as Repo Lock (R.lock)
    participant PL as PR Lock (per PR)
    participant GL as Git Lock (git_repo_lock)
    participant G as Local Git Worktree

    par Webhook-driven (push / PR events)
        GH->>WH: webhook (push | pull_request)
        WH->>R: route event

        alt push
            WH->>RL: acquire Repo lock
            RL->>R: manage_components(changed_only, skip_pr_processing)
            RL->>GL: acquire Git lock
            GL->>G: clone/fetch + checkout main, list components
            G-->>GL: updated worktree + component paths
            GL-->>RL: release Git lock
            RL-->>WH: release Repo lock
        else pull_request: opened | reopened | synchronize
            WH->>RL: acquire Repo lock
            RL->>R: get_pr_lock
            R->>PL: acquire PR lock
            PL->>GL: acquire Git lock
            GL->>G: fetch PR ref / checkout SHA / compute diff
            G-->>GL: changed files
            PL->>R: create/update/delete components, annotate used-by-prs
            GL-->>PL: release Git lock
            PL-->>RL: release PR lock
            RL-->>WH: release Repo lock
        else pull_request: closed
            WH->>RL: acquire Repo lock
            RL->>R: cleanup PR annotations / optional main sync
            RL->>GL: acquire Git lock (if sync/list needed)
            GL->>G: checkout main, recalc components/annotations
            GL-->>RL: release Git lock
            RL-->>WH: release Repo lock
        end
    and Polling-driven (periodic sync/maintenance)
        P->>R: tick()
        P->>GL: acquire Git lock
        GL->>G: ensure repo present (clone/fetch), checkout main
        G-->>GL: up-to-date worktree
        P->>R: _agnosticv_get_all_component_paths_no_lock()
        GL->>G: (still under Git lock) list component dirs
        G-->>GL: component paths
        GL-->>P: release Git lock

        opt (optional) per-PR maintenance
            P->>R: scan PR metadata needing refresh/cleanup
            P->>PL: acquire PR lock (one PR at a time)
            PL->>GL: acquire Git lock
            GL->>G: fetch/check PR ref, verify state, compute changes
            G-->>GL: results
            PL->>R: update annotations / cleanup
            GL-->>PL: release Git lock
            PL-->>P: release PR lock
        end
    end

    Note over RL,GL: "Lock order is always Repo → PR → Git, when all three apply.<br/>Releases occur in reverse order to avoid deadlocks."
```
