# AI Task Platform — Architecture Document

## System Overview

The AI Task Processing Platform is a cloud-native MERN-stack application with an asynchronous Python worker for background processing. The system is designed for horizontal scalability, resilience, and GitOps-driven deployment.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Internet / Users                           │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS
                        ┌───────▼───────┐
                        │  Nginx Ingress │
                        │  (TLS Termination)│
                        └──────┬────────┘
                      ┌────────┴────────┐
                      │                 │
               ┌──────▼──────┐  ┌──────▼──────┐
               │  Frontend   │  │  Backend API │
               │  (React)    │  │  (Node.js)  │
               │  2–3 pods   │  │  2–3 pods   │
               └─────────────┘  └──────┬──────┘
                                       │
                              ┌────────▼────────┐
                              │    Redis Queue   │
                              │   (Bull Jobs)    │
                              └────────┬────────┘
                                       │ BLPOP / Job push
                              ┌────────▼────────┐
                              │  Python Workers  │
                              │  2–10 pods (HPA) │
                              └────────┬────────┘
                                       │
                              ┌────────▼────────┐
                              │    MongoDB       │
                              │  (Persistent)    │
                              └─────────────────┘
```

---

## 1. Worker Scaling Strategy

### Horizontal Scaling via HPA
Workers are stateless and designed for horizontal scaling. The Kubernetes HPA automatically adjusts replicas:
- **Minimum replicas:** 2 (always-on for availability)
- **Maximum replicas:** 10 (burst capacity)
- **Scale-up trigger:** CPU > 70% OR Memory > 80%
- **Scale-down:** Gradual (prevents flapping)

### Worker Design for Safe Scaling
- Each worker processes one job at a time (single-threaded but concurrent across pods)
- Redis `BLPOP` with atomic pop prevents duplicate job processing
- Job IDs tracked per worker (`HOSTNAME` env var = pod name) for full traceability
- Graceful shutdown on `SIGTERM`: finishes current job before exit

### Multiple Worker Types (Future)
For task priority, multiple queues can be implemented:
- `task-queue:high` — premium users
- `task-queue:normal` — standard users
- `task-queue:batch` — bulk operations

---

## 2. Handling High Task Volume (100,000 Tasks/Day)

### Back-of-envelope Calculation
- 100,000 tasks/day ≈ 1.16 tasks/second average
- Peak load estimated at 10x average ≈ 12 tasks/second
- Each task takes ~0.5–2 seconds to process
- Workers needed at peak: ~6–12 pods (HPA handles this)

### Architecture Decisions for Scale

**Queue-based decoupling:** The backend immediately returns after pushing to Redis. Workers consume at their own pace, creating a natural buffer for traffic spikes.

**Redis as a message buffer:** Redis can handle millions of queued jobs. At 100k/day, the queue depth stays manageable. Bull provides retry logic, dead-letter queuing, and job persistence.

**Database write optimization:**
- Worker uses `update_one` with `$set` and `$push` to minimize round-trips
- Indexes on `(userId, createdAt)` and `(status, createdAt)` ensure fast reads
- Write concern can be reduced to `w:1` for worker status updates (eventual consistency acceptable)

**Read performance:** List endpoints are paginated (default 10 items), preventing large result sets.

**Future improvements for 10x scale (1M/day):**
- MongoDB replica set with read preference `secondaryPreferred`
- Redis Cluster mode for horizontal queue scaling
- Worker pods with multiple threads using Python `asyncio` or `concurrent.futures`

---

## 3. Database Indexing Strategy

### Current Indexes

| Collection | Index | Purpose |
|------------|-------|---------|
| `users` | `{ email: 1 }` | Login lookup |
| `users` | `{ username: 1 }` | Uniqueness check |
| `tasks` | `{ userId: 1, createdAt: -1 }` | User's task list, newest first |
| `tasks` | `{ userId: 1, status: 1 }` | Filtered task list by status |
| `tasks` | `{ status: 1, createdAt: 1 }` | Worker queue monitoring |

### Index Rationale
- All user-facing queries filter by `userId` first, so it leads every compound index
- `createdAt: -1` for descending sort on dashboard (newest tasks first)
- `status` index allows fast filtering on admin dashboards

### Future Considerations
- TTL index on completed tasks for automatic expiry (e.g., delete after 30 days)
- Text index on `title` and `inputText` if search functionality is added
- Partial index: `{ status: 1 }` where `status in ['pending', 'running']` — small, fast for worker monitoring

---

## 4. Handling Redis Failure

### Failure Modes & Mitigations

**Redis goes down:**
- Workers detect `redis.exceptions.ConnectionError` and enter retry loop with exponential backoff (up to 30 seconds)
- Backend returns `503 Service Unavailable` for new task creation if Redis is unreachable
- Existing tasks in `pending` status in MongoDB remain and can be re-queued on recovery

**Redis data loss (no persistence):**
- Tasks created before crash exist in MongoDB with `status: 'pending'`
- Recovery script (optional) can scan MongoDB for stuck `pending` tasks and re-enqueue them:
  ```python
  # recovery.py
  stuck = tasks.find({"status": "pending", "createdAt": {"$lt": 30_min_ago}})
  for task in stuck:
      queue.push(task)
  ```

**Redis persistence:** Configured with `appendonly yes` for AOF persistence, minimizing data loss window.

**Production upgrade:** For critical workloads, Redis Sentinel or Redis Cluster provides high availability with automatic failover.

---

## 5. Staging and Production Environments

### GitOps Workflow with Argo CD

```
Developer pushes code
        │
        ▼
GitHub Actions CI
  ├── Lint checks
  ├── Build Docker images
  ├── Push to Docker Hub with SHA tag
  └── Update image tags in infra repo
              │
              ▼
      Argo CD detects change
      ├── Staging app → k8s/overlays/staging (auto-sync)
      └── Production app → k8s/overlays/production (auto-sync)
```

### Environment Differences

| Aspect | Staging | Production |
|--------|---------|------------|
| Replicas (backend/frontend) | 1 each | 3 each |
| Worker replicas | 1 | 3 (min), 10 (max HPA) |
| Domain | staging.aitask.yourdomain.com | aitask.yourdomain.com |
| Resource limits | 50% of prod | Full |
| Secrets | Separate staging secrets | Production secrets (different JWT key) |

### Namespace Isolation
- `ai-task-platform` — production
- `ai-task-platform-staging` — staging
- Separate Argo CD applications manage each environment

### Promotion Flow
1. Push to `staging` branch → CI builds images with `staging-<sha>` tag → Argo CD deploys to staging
2. QA verification on staging environment
3. Merge staging to `main` → CI builds `<sha>` tag → Argo CD auto-deploys to production

---

## Security Architecture

- **JWT authentication:** Stateless, 7-day expiry, per-user validation on every request
- **bcrypt password hashing:** Cost factor 12 (recommended for 2024)
- **Helmet.js:** Sets 11 security-related HTTP headers
- **Rate limiting:** 100 req/15min globally, 10 req/15min for auth endpoints
- **Non-root containers:** All containers run as unprivileged users
- **No hardcoded secrets:** All secrets via Kubernetes Secrets / environment variables
- **CORS:** Locked to frontend origin only

---

## Technology Choices Rationale

| Component | Choice | Reason |
|-----------|--------|--------|
| Queue | Bull (Redis) | Battle-tested, retry logic, job monitoring, widely used in Node.js ecosystem |
| Worker language | Python | Rich text processing ecosystem, clean async patterns, good Redis client |
| Database | MongoDB | Flexible schema for task logs (array field), good for write-heavy workloads |
| GitOps | Argo CD | Industry standard, excellent UI, automatic drift detection |
| Container runtime | Docker with multi-stage builds | Minimal image size, security via non-root users |
