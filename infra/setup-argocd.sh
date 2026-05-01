#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# Argo CD Setup Script for AI Task Platform
# Usage: bash infra/setup-argocd.sh
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC}   $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

echo ""
echo "  ⚡ AI Task Platform — Argo CD Setup"
echo "  ─────────────────────────────────────"
echo ""

# ── Step 1: Install Argo CD ──────────────────────────────────────────────────
log "Creating argocd namespace..."
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -

log "Installing Argo CD..."
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

log "Waiting for Argo CD pods to be ready (this may take 2-3 minutes)..."
kubectl wait --for=condition=Ready pods --all -n argocd --timeout=300s
ok "Argo CD pods are ready"

# ── Step 2: Get admin password ───────────────────────────────────────────────
ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d)

ok "Argo CD installed successfully!"
echo ""
echo "  ┌──────────────────────────────────────────────────┐"
echo "  │  Argo CD Access Details                          │"
echo "  │  URL:      https://localhost:8080                │"
echo "  │  Username: admin                                 │"
echo "  │  Password: ${ARGOCD_PASSWORD}  │"
echo "  └──────────────────────────────────────────────────┘"
echo ""

# ── Step 3: Port-forward in background ──────────────────────────────────────
log "Starting port-forward to Argo CD UI on localhost:8080..."
kubectl port-forward svc/argocd-server -n argocd 8080:443 &
PF_PID=$!
sleep 2

# ── Step 4: Login via CLI (if argocd CLI is installed) ──────────────────────
if command -v argocd &>/dev/null; then
  log "Logging into Argo CD CLI..."
  argocd login localhost:8080 \
    --username admin \
    --password "${ARGOCD_PASSWORD}" \
    --insecure

  ok "Argo CD CLI logged in"

  # ── Step 5: Add infra repo ─────────────────────────────────────────────────
  echo ""
  warn "You need to configure your infra repository."
  read -p "  Enter your infra repo URL (e.g. https://github.com/user/ai-task-platform-infra): " INFRA_REPO

  if [[ -n "$INFRA_REPO" ]]; then
    read -p "  Is the repo private? (y/n): " IS_PRIVATE
    if [[ "$IS_PRIVATE" == "y" ]]; then
      read -p "  GitHub username: " GH_USER
      read -s -p "  GitHub token/password: " GH_TOKEN
      echo ""
      argocd repo add "$INFRA_REPO" --username "$GH_USER" --password "$GH_TOKEN"
    else
      argocd repo add "$INFRA_REPO"
    fi
    ok "Repository added"
  fi
else
  warn "argocd CLI not found. Install from: https://argo-cd.readthedocs.io/en/stable/cli_installation/"
fi

# ── Step 6: Apply Argo CD applications ──────────────────────────────────────
echo ""
log "Applying Argo CD Application manifests..."
warn "Make sure to edit infra/argocd-app.yaml with your actual repo URL first!"
read -p "  Have you updated argocd-app.yaml with your repo URL? (y/n): " UPDATED
if [[ "$UPDATED" == "y" ]]; then
  kubectl apply -f infra/argocd-app.yaml
  ok "Argo CD applications created"
  echo ""
  log "Syncing applications..."
  if command -v argocd &>/dev/null; then
    argocd app sync ai-task-platform || true
    argocd app sync ai-task-platform-staging || true
  fi
fi

echo ""
ok "Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Open https://localhost:8080 in your browser"
echo "  2. Login with admin / ${ARGOCD_PASSWORD}"
echo "  3. You should see your applications syncing"
echo "  4. Take a screenshot of the Argo CD dashboard for your submission!"
echo ""
echo "  Kill port-forward with: kill ${PF_PID}"
echo ""
