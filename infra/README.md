# AI Task Platform — Infrastructure Repository

> This is the **infrastructure repository** for the AI Task Platform, managed via GitOps with Argo CD.
> The application code lives at: `https://github.com/yourusername/ai-task-platform`

## Repository Structure

```
ai-task-platform-infra/
└── k8s/
    ├── base/                    # Base Kubernetes manifests
    │   ├── namespace.yaml
    │   ├── configmap.yaml
    │   ├── secrets.yaml         ← Replace with Sealed Secrets in production
    │   ├── mongo.yaml
    │   ├── redis.yaml
    │   ├── backend.yaml         ← Image tag updated by CI/CD
    │   ├── worker.yaml          ← Image tag updated by CI/CD
    │   ├── frontend.yaml        ← Image tag updated by CI/CD
    │   ├── ingress.yaml
    │   └── kustomization.yaml
    └── overlays/
        ├── production/          ← 3 replicas, full limits
        │   └── kustomization.yaml
        └── staging/             ← 1 replica, minimal
            └── kustomization.yaml
```

## GitOps Workflow

```
App Repo push (main)
       │
       ▼
GitHub Actions CI
  ├── Builds Docker images
  ├── Pushes to Docker Hub
  └── Updates image tags HERE (in this repo)
              │
              ▼
       Argo CD detects change
       └── Auto-syncs to Kubernetes cluster
```

## Argo CD Applications

| Application | Path | Namespace | Auto-Sync |
|-------------|------|-----------|-----------|
| `ai-task-platform` | `k8s/overlays/production` | `ai-task-platform` | ✅ |
| `ai-task-platform-staging` | `k8s/overlays/staging` | `ai-task-platform-staging` | ✅ |

## Manual Sync

```bash
argocd app sync ai-task-platform
argocd app sync ai-task-platform-staging
```

## Updating Image Tags Manually

```bash
# Update backend image
kubectl set image deployment/backend \
  backend=yourdockerhub/ai-task-backend:v1.2.3 \
  -n ai-task-platform

# Or edit the YAML and git push (preferred — GitOps way)
sed -i 's|ai-task-backend:.*|ai-task-backend:v1.2.3|' k8s/base/backend.yaml
git add . && git commit -m "update backend to v1.2.3" && git push
# Argo CD will auto-sync within 3 minutes
```

## Secrets Management

⚠️ The `secrets.yaml` in this repo contains placeholder values. For production:

**Option 1 — Bitnami Sealed Secrets (recommended)**
```bash
# Install sealed-secrets controller
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

# Seal your secret
kubectl create secret generic app-secrets \
  --from-literal=JWT_SECRET='your-real-secret' \
  --dry-run=client -o yaml | \
  kubeseal --format yaml > k8s/base/sealed-secrets.yaml
```

**Option 2 — External Secrets Operator** (AWS Secrets Manager / Vault)
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: app-secrets
spec:
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: app-secrets
  data:
    - secretKey: JWT_SECRET
      remoteRef:
        key: ai-task-platform/jwt-secret
```
