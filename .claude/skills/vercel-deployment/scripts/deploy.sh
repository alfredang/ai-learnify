#!/usr/bin/env bash
# Vercel Deployment Script
# Deploys to Vercel with project name from folder, then disables Vercel Authentication.
set -euo pipefail

# --- Configuration ---
PROJECT_DIR="${1:-.}"
PROD_FLAG="${2:-}"  # pass "prod" for production deployment

# Resolve absolute path and extract folder name
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
PROJECT_NAME="$(basename "$PROJECT_DIR")"

echo "=== Vercel Deployment ==="
echo "Project directory: $PROJECT_DIR"
echo "Project name: $PROJECT_NAME"
echo ""

# --- Step 1: Check Vercel CLI ---
if ! command -v vercel &> /dev/null; then
    echo "ERROR: Vercel CLI not found. Install with: npm i -g vercel"
    exit 1
fi

# --- Step 2: Check authentication ---
if ! vercel whoami &> /dev/null 2>&1; then
    echo "ERROR: Not logged in to Vercel. Run: vercel login"
    exit 1
fi
echo "Authenticated as: $(vercel whoami 2>/dev/null)"

# --- Step 3: Get Vercel token for API calls ---
VERCEL_TOKEN="${VERCEL_TOKEN:-}"
if [ -z "$VERCEL_TOKEN" ]; then
    echo ""
    echo "WARNING: VERCEL_TOKEN not set. Will skip disabling Vercel Authentication."
    echo "To enable auto-disable of auth, set VERCEL_TOKEN environment variable."
    echo "Create one at: https://vercel.com/account/tokens"
    echo ""
    SKIP_AUTH_DISABLE=true
else
    SKIP_AUTH_DISABLE=false
fi

# --- Step 4: Deploy ---
echo ""
echo "--- Deploying to Vercel ---"

DEPLOY_ARGS="--yes"
if [ "$PROD_FLAG" = "prod" ]; then
    DEPLOY_ARGS="$DEPLOY_ARGS --prod"
    echo "Target: Production"
else
    echo "Target: Preview"
fi

DEPLOY_URL=$(vercel deploy $DEPLOY_ARGS --cwd "$PROJECT_DIR" 2>/dev/null)
echo "Deployed: $DEPLOY_URL"

# --- Step 5: Disable Vercel Authentication ---
if [ "$SKIP_AUTH_DISABLE" = false ]; then
    echo ""
    echo "--- Disabling Vercel Authentication ---"

    # Detect team (scope) if available
    TEAM_QUERY=""
    TEAM_ID="${VERCEL_TEAM_ID:-}"
    if [ -n "$TEAM_ID" ]; then
        TEAM_QUERY="?teamId=$TEAM_ID"
    fi

    # Disable ssoProtection (Vercel Authentication) via API
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -X PATCH "https://api.vercel.com/v9/projects/$PROJECT_NAME$TEAM_QUERY" \
        -H "Authorization: Bearer $VERCEL_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"ssoProtection": null}')

    if [ "$HTTP_STATUS" = "200" ]; then
        echo "Vercel Authentication: DISABLED"
    else
        echo "WARNING: Failed to disable Vercel Authentication (HTTP $HTTP_STATUS)"
        echo "You may need to disable it manually in: Vercel Dashboard > Settings > Deployment Protection"
    fi
fi

# --- Summary ---
echo ""
echo "=== Deployment Complete ==="
echo "URL: $DEPLOY_URL"
echo "Project: $PROJECT_NAME"
echo ""
