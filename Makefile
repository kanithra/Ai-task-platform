# AI Task Platform - Makefile
# Usage: make <target>

.PHONY: help up down build logs clean k8s-deploy argocd-setup

# Default
help:
	@echo ""
	@echo "  ⚡ AI Task Platform - Available Commands"
	@echo "  ─────────────────────────────────────────"
	@echo "  make up          Start all services (Docker Compose)"
	@echo "  make down        Stop all services"
	@echo "  make build       Rebuild Docker images"
	@echo "  make logs        Tail logs from all services"
	@echo "  make logs-worker Tail worker logs only"
	@echo "  make clean       Remove containers, volumes, images"
	@echo "  make k8s-deploy  Apply Kubernetes manifests directly"
	@echo "  make argocd-setup Install and configure Argo CD"
	@echo "  make k8s-status  Show K8s pod/service status"
	@echo ""

# ── Docker Compose ────────────────────────────────────────────────────────────
up:
	docker compose up --build -d
	@echo "✓ Services started"
	@echo "  Frontend:  http://localhost:3000"
	@echo "  Backend:   http://localhost:5000"

up-dev:
	docker compose up --build

down:
	docker compose down

build:
	docker compose build --no-cache

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

logs-worker:
	docker compose logs -f worker

logs-frontend:
	docker compose logs -f frontend

clean:
	docker compose down -v --rmi local
	@echo "✓ Cleaned up containers, volumes, and local images"

# ── Kubernetes ────────────────────────────────────────────────────────────────
k8s-deploy:
	kubectl apply -k k8s/overlays/production

k8s-status:
	@echo "\n── Pods ──────────────────────────────────────"
	kubectl get pods -n ai-task-platform
	@echo "\n── Services ──────────────────────────────────"
	kubectl get svc -n ai-task-platform
	@echo "\n── Ingress ───────────────────────────────────"
	kubectl get ingress -n ai-task-platform
	@echo "\n── HPA ───────────────────────────────────────"
	kubectl get hpa -n ai-task-platform

k8s-logs-backend:
	kubectl logs -l app=backend -n ai-task-platform --tail=100 -f

k8s-logs-worker:
	kubectl logs -l app=worker -n ai-task-platform --tail=100 -f

k8s-scale-workers:
	kubectl scale deployment worker --replicas=$(n) -n ai-task-platform
	@echo "✓ Scaled workers to $(n) replicas"

# ── Argo CD ───────────────────────────────────────────────────────────────────
argocd-setup:
	@echo "Installing Argo CD..."
	kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
	kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
	@echo "Waiting for Argo CD pods..."
	kubectl wait --for=condition=Ready pods --all -n argocd --timeout=300s
	@echo "\n✓ Argo CD installed!"
	@echo "Admin password:"
	@kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
	@echo "\nRun: kubectl port-forward svc/argocd-server -n argocd 8080:443"
	@echo "Then open: https://localhost:8080"

argocd-app:
	kubectl apply -f infra/argocd-app.yaml

# ── Secrets ───────────────────────────────────────────────────────────────────
create-secrets:
	@read -p "Enter JWT_SECRET: " jwt; \
	kubectl create secret generic app-secrets \
	  --from-literal=JWT_SECRET="$$jwt" \
	  --from-literal=REDIS_PASSWORD="" \
	  -n ai-task-platform \
	  --dry-run=client -o yaml | kubectl apply -f -
	@echo "✓ Secrets created"
