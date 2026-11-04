#!/usr/bin/env bash
# One-time Google Cloud setup for deploying Discogs Preview to Cloud Run from GitHub Actions.
# Run it in Google Cloud Shell (https://shell.cloud.google.com), logged in as a project owner:
#
#   bash deploy/setup-gcp.sh [PROJECT_ID] [DEPLOY_SERVICE_ACCOUNT_EMAIL] [REGION]
#
# Anything you leave out is asked for. Safe to re-run.
set -euo pipefail

SERVICE=discogs-preview
REPOSITORY=discogs-preview
SECRETS=(discogs-consumer-key discogs-consumer-secret session-secret)

ask() { # ask VAR "Prompt" [default]
  local __var=$1 __prompt=$2 __default=${3:-} __reply
  if [ -n "${!__var:-}" ]; then return; fi
  read -rp "$__prompt${__default:+ [$__default]}: " __reply
  printf -v "$__var" '%s' "${__reply:-$__default}"
  if [ -z "${!__var}" ]; then echo "A value is required." >&2; exit 1; fi
}

PROJECT_ID=${1:-}
DEPLOY_SA=${2:-}
REGION=${3:-}
ask PROJECT_ID "Google Cloud project ID" "$(gcloud config get-value project 2>/dev/null || true)"
ask DEPLOY_SA "Deploy service account email (client_email in credentials.json)"
ask REGION "Region" "europe-west2"

RUNTIME_SA="$SERVICE-run@$PROJECT_ID.iam.gserviceaccount.com"
gcloud config set project "$PROJECT_ID" >/dev/null

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

step "Checking billing"
if [ "$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || true)" = "False" ]; then
  echo "Billing is not enabled on $PROJECT_ID. Cloud Run needs a billing account (personal use fits in the free allowance)."
  echo "Enable it at https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID and re-run."
  exit 1
fi

step "Enabling APIs (this can take a minute)"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iam.googleapis.com

step "Artifact Registry repository '$REPOSITORY' in $REGION"
if ! gcloud artifacts repositories describe "$REPOSITORY" --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPOSITORY" --repository-format docker --location "$REGION" \
    --description "Discogs Preview images"
fi
POLICY=$(mktemp)
cat > "$POLICY" <<'JSON'
[
  { "name": "keep-latest-3", "action": { "type": "Keep" }, "mostRecentVersions": { "keepCount": 3 } },
  { "name": "delete-older", "action": { "type": "Delete" }, "condition": { "olderThan": "1d" } }
]
JSON
gcloud artifacts repositories set-cleanup-policies "$REPOSITORY" --location "$REGION" --policy "$POLICY" --no-dry-run --quiet >/dev/null
rm -f "$POLICY"
echo "Keeps the 3 most recent images."

step "Runtime service account $RUNTIME_SA"
if ! gcloud iam service-accounts describe "$RUNTIME_SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SERVICE-run" --display-name "Discogs Preview (Cloud Run runtime)"
fi

put_secret() { # put_secret NAME VALUE
  local name=$1 value=$2
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null
  else
    printf '%s' "$value" | gcloud secrets create "$name" --replication-policy automatic --data-file=- >/dev/null
  fi
  echo "Saved $name."
}

secret_exists() { gcloud secrets describe "$1" >/dev/null 2>&1; }

step "Secrets"
echo "Use the Consumer Key/Secret of a Discogs app registered for this deployment"
echo "(https://www.discogs.com/settings/developers). You'll set its callback URL after the first deploy."
replace=y
if secret_exists discogs-consumer-key && secret_exists discogs-consumer-secret; then
  read -rp "Discogs secrets already exist. Replace them? [y/N]: " replace
fi
if [[ "$replace" =~ ^[Yy]$ ]]; then
  read -rsp "Discogs Consumer Key: " DKEY; echo
  read -rsp "Discogs Consumer Secret: " DSECRET; echo
  if [ -z "$DKEY" ] || [ -z "$DSECRET" ]; then echo "Both values are required." >&2; exit 1; fi
  put_secret discogs-consumer-key "$DKEY"
  put_secret discogs-consumer-secret "$DSECRET"
  unset DKEY DSECRET
fi
if ! secret_exists session-secret; then
  put_secret session-secret "$(openssl rand -base64 48 | tr -d '\n')"
else
  echo "session-secret already exists (kept, so existing sign-ins stay valid)."
fi

step "Permissions"
for name in "${SECRETS[@]}"; do
  gcloud secrets add-iam-policy-binding "$name" --member "serviceAccount:$RUNTIME_SA" \
    --role roles/secretmanager.secretAccessor --quiet >/dev/null
done
echo "Runtime account can read the 3 secrets (and nothing else)."
for role in roles/run.admin roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$DEPLOY_SA" \
    --role "$role" --condition None --quiet >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --member "serviceAccount:$DEPLOY_SA" \
  --role roles/iam.serviceAccountUser --quiet >/dev/null
echo "Deploy account can push images and deploy the service."

cat <<DONE

$(printf '\033[1m')Google Cloud is ready.$(printf '\033[0m') Next:

  1. In GitHub: repo → Settings → Secrets and variables → Actions
       • New repository secret  GCP_SA_KEY  = the full contents of credentials.json
       • Variables tab → New variable  GCP_REGION = $REGION   (only needed if not europe-west2)
  2. Merge the pull request (or push to main). The "Deploy to Cloud Run" workflow prints the app URL.
  3. Set your Discogs app's Callback URL to  <app URL>/api/auth/discogs/callback
DONE
