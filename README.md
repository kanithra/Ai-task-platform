# AI Task Processing Platform

A production-ready MERN + Python stack application with asynchronous task processing, Redis queuing, Kubernetes deployment, and GitOps via Argo CD.

---

## Screenshots

### Login Page
![Login](screenshot/login.png)

### Register Page
![Register](screenshot/register.png)

### Dashboard
![Dashboard](screenshot/dashboard.png)

### Tasks List
![Tasks](screenshot/task1.png)

### Task Detail
![Task Detail](screenshot/task%20detail.png)

### Task Detail - Result
![Task Detail 2](screenshot/task%20detail%202.png)

### Task Completed
![Task Done](screenshot/task%20done.png)

---

## Architecture Overview

```
React Frontend  ──>  Express API  ──>  Redis Queue  ──>  Python Worker  ──>  MongoDB
     |                   |                                      |
     └───────────── JWT Auth ──────────────────────────── Task Results
```

### Services

| Service | Technology | Port |
|---------|-----------|------|
| Frontend | React 18 + Nginx | 3000 (dev) / 80 |
| Backend API | Node.js + Express | 5000 |
| Worker | Python 3.12 | — (background) |
| Database | MongoDB Atlas | Cloud |
| Queue | Redis 7.2 | 6379 |

### Supported Operations

| Operation | Description |
|-----------|-------------|
| `uppercase` | Convert all text to uppercase |
| `lowercase` | Convert all text to lowercase |
| `reverse` | Reverse the entire string |
| `word_count` | Count words, chars, lines, sentences |

---

## Quick Start (Local with Docker Compose)

### Prerequisites
- Docker 24+ and Docker Compose v2
- Git
- MongoDB Atlas account (free) — for database

### 1. Clone and Configure

```bash
git clone https://github.com/yourusername/ai-task-platform.git
cd ai-task-platform
```

Edit `docker-compose.yml` and update `MONGODB_URI` with your Atlas connection string:
```
mongodb+srv://username:password@cluster.mongodb.net/ai-task-platform
```

### 2. Start All Services

```bash
docker compose up --build
```

This starts:
- Frontend at http://localhost:3000
- Backend API at http://localhost:5000
- Python worker (background processor)
- Redis at localhost:6379

### 3. Verify Health

```bash
curl http://localhost:5000/health
```

Expected response:
```json
{"status":"ok","timestamp":"...","service":"backend"}
```

### 4. Create an Account

Navigate to http://localhost:3000/register and create your account.

---

## Local Development (Without Docker)

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Set your MongoDB Atlas URI and JWT secret in .env
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm start
```

### Worker

```bash
cd worker
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python worker.py
```

---

## Kubernetes Deployment (k3s / k8s)

### Prerequisites
- kubectl configured
- k3s or a Kubernetes cluster
- Nginx Ingress Controller

### Step 1: Install Argo CD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for pods to be ready
kubectl wait --for=condition=Ready pods --all -n argocd --timeout=300s

# Get initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d

# Port-forward to access UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Access at https://localhost:8080
```

### Step 2: Configure Secrets

```bash
kubectl apply -f k8s/base/namespace.yaml

kubectl create secret generic app-secrets \
  --from-literal=JWT_SECRET='your-super-secret-jwt-key-min-32-chars' \
  --from-literal=REDIS_PASSWORD='' \
  -n ai-task-platform
```

### Step 3: Update Image Names

Edit `k8s/base/backend.yaml`, `worker.yaml`, `frontend.yaml` and replace `yourdockerhub/` with your Docker Hub username.

### Step 4: Deploy via Argo CD

```bash
kubectl apply -f infra/argocd-app.yaml

argocd login localhost:8080
argocd app sync ai-task-platform
argocd app get ai-task-platform
```

### Step 5: Verify Deployment

```bash
kubectl get pods -n ai-task-platform
kubectl get svc -n ai-task-platform
kubectl get ingress -n ai-task-platform
```

### Scale Workers

```bash
kubectl scale deployment worker --replicas=5 -n ai-task-platform
```

---

## CI/CD Setup (GitHub Actions)

### Required GitHub Secrets

| Secret | Value |
|--------|-------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token |
| `INFRA_REPO` | `yourusername/ai-task-platform-infra` |
| `INFRA_REPO_TOKEN` | GitHub PAT with repo write access |

### CI/CD Flow

1. Push to `main`
2. GitHub Actions: lint checks
3. Build Docker images
4. Push to Docker Hub with SHA tag
5. Update image tags in infra repository
6. Argo CD auto-deploys to Kubernetes

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login and get JWT |
| GET | `/api/auth/me` | Get current user |

### Tasks (requires Authorization: Bearer token)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List tasks (paginated) |
| POST | `/api/tasks` | Create and queue a task |
| GET | `/api/tasks/:id` | Get task details |
| DELETE | `/api/tasks/:id` | Delete a task |
| GET | `/api/tasks/:id/logs` | Get execution logs |

### Query Parameters for GET /api/tasks

- `status` — filter by: pending, running, success, failed
- `page` — page number (default: 1)
- `limit` — items per page (default: 10)

### Create Task Body

```json
{
  "title": "My Task",
  "inputText": "Hello World",
  "operation": "uppercase"
}
```

---

## Security Features

- Password hashing with bcrypt (cost factor 12)
- JWT authentication with 7-day expiry
- Helmet.js security headers
- Rate limiting: 1000 req/15min (50 for auth)
- Input validation and sanitization
- Non-root Docker containers
- No hardcoded secrets (env vars / K8s Secrets)
- CORS restricted to frontend origin
- Request body size limit (10kb)

---

## Project Structure

```
ai-task-platform/
├── backend/                    # Node.js + Express API
│   ├── config/
│   │   ├── logger.js           # Winston logger
│   │   └── queue.js            # Bull/Redis queue config
│   ├── middleware/
│   │   └── auth.js             # JWT authentication
│   ├── models/
│   │   ├── User.js             # Mongoose User model
│   │   └── Task.js             # Mongoose Task model
│   ├── routes/
│   │   ├── auth.js             # Auth endpoints
│   │   └── tasks.js            # Task CRUD endpoints
│   ├── server.js               # Express app entry point
│   ├── Dockerfile              # Multi-stage Docker build
│   └── .env.example
│
├── frontend/                   # React 18 SPA
│   ├── src/
│   │   ├── api/index.js
│   │   ├── context/AuthContext.js
│   │   ├── components/Layout.js
│   │   ├── pages/
│   │   │   ├── Login.js
│   │   │   ├── Register.js
│   │   │   ├── Dashboard.js
│   │   │   ├── Tasks.js
│   │   │   └── TaskDetail.js
│   │   └── index.css           # Dark theme styles
│   └── Dockerfile
│
├── worker/                     # Python background processor
│   ├── worker.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── k8s/
│   ├── base/                   # Base Kubernetes manifests
│   │   ├── namespace.yaml
│   │   ├── configmap.yaml
│   │   ├── secrets.yaml
│   │   ├── mongo.yaml
│   │   ├── redis.yaml
│   │   ├── backend.yaml
│   │   ├── worker.yaml         # Includes HPA
│   │   ├── frontend.yaml
│   │   ├── ingress.yaml
│   │   └── kustomization.yaml
│   └── overlays/
│       ├── production/         # 3 replicas, full resources
│       └── staging/            # 1 replica, minimal resources
│
├── infra/
│   └── argocd-app.yaml
│
├── .github/workflows/
│   └── ci-cd.yml               # GitHub Actions pipeline
│
├── screenshot/                 # Application screenshots
├── docker-compose.yml
├── ARCHITECTURE.md
└── README.md
```

---

## Troubleshooting

### Worker not processing tasks

```bash
docker compose logs worker
docker compose exec redis redis-cli ping
docker compose exec redis redis-cli llen "bull:task-queue:wait"
```

### Tasks stuck in pending

```bash
docker compose ps worker
docker compose restart worker
```

### Backend errors

```bash
docker compose logs backend --tail=50
```

---

## Monitoring (Production)

For production monitoring, recommended additions:
- Prometheus + Grafana for metrics
- MongoDB Atlas built-in monitoring
- Redis Cloud for high availability
- Datadog or New Relic APM

---

## Architecture Document

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed documentation covering:
- Worker scaling strategy
- Handling 100,000 tasks per day
- Database indexing strategy
- Redis failure handling
- Staging and production environment setup