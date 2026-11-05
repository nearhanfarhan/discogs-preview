#!/usr/bin/env bash
# Checks that the service account in GCP_SA_KEY can deploy this app to Cloud Run, fixes what it
# is allowed to fix itself (enabling APIs, creating the image repository), and otherwise writes a
# report with a ready-to-forward message for the project owner.
#
# Run by .github/workflows/deploy.yml after google-github-actions/auth. Expects:
#   PROJECT_ID, REGION, REPOSITORY, SA_EMAIL
#   SUMMARY  file to append the Markdown report to (defaults to stdout)
# Exit code: 0 = ready (or couldn't tell, so let the deploy try), 1 = something is definitely missing.
set -uo pipefail

: "${PROJECT_ID:?}" "${REGION:?}" "${REPOSITORY:?}" "${SA_EMAIL:?}"
SUMMARY=${SUMMARY:-/dev/stdout}

APIS=(run.googleapis.com artifactregistry.googleapis.com)
PROJECT_PERMS=(run.services.create run.services.update run.services.get run.services.setIamPolicy artifactregistry.repositories.uploadArtifacts)

rows=()          # Markdown table rows
missing=0        # anything definitely missing?
need_apis=()     # owner: enable these
need_roles=()    # owner: grant these project roles
need_actas=0     # owner: grant serviceAccountUser on the account itself

row() { rows+=("| $1 | $2 | $3 |"); }
add_role() { local r; for r in "${need_roles[@]}"; do [ "$r" = "$1" ] && return; done; need_roles+=("$1"); }

token=$(gcloud auth print-access-token 2>/dev/null || true)

# POST a testIamPermissions request; prints the granted permissions (one per line), or fails.
granted_perms() { # URL perm...
  local url=$1; shift
  local body
  body=$(jq -cn '{permissions: $ARGS.positional}' --args "$@")
  curl -sSf -X POST -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "$body" "$url" 2>/dev/null |
    jq -r '.permissions // [] | .[]'
}

# ---- APIs -------------------------------------------------------------------------------------
apis_ok=1
if enabled=$(gcloud services list --enabled --project "$PROJECT_ID" --format='value(config.name)' 2>/dev/null); then
  for api in "${APIS[@]}"; do
    if grep -qx "$api" <<<"$enabled"; then
      row "API \`$api\`" "✅" "enabled"
    elif gcloud services enable "$api" --project "$PROJECT_ID" >/dev/null 2>&1; then
      row "API \`$api\`" "✅" "was off, enabled it"
    else
      row "API \`$api\`" "❌" "off, and this account can't enable it"
      need_apis+=("$api"); missing=1; apis_ok=0
    fi
  done
else
  row "APIs" "❔" "couldn't list enabled APIs (needs \`serviceusage.services.list\`), carrying on"
fi

# ---- Image repository -------------------------------------------------------------------------
if gcloud artifacts repositories describe "$REPOSITORY" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  row "Image repository \`$REPOSITORY\` ($REGION)" "✅" "exists"
elif [ "$apis_ok" = 0 ]; then
  row "Image repository \`$REPOSITORY\` ($REGION)" "❔" "will be checked once the APIs are on"
elif gcloud artifacts repositories create "$REPOSITORY" --repository-format docker \
  --location "$REGION" --project "$PROJECT_ID" --description "Discogs Preview images" >/dev/null 2>&1; then
  row "Image repository \`$REPOSITORY\` ($REGION)" "✅" "created it"
else
  row "Image repository \`$REPOSITORY\` ($REGION)" "❌" "missing, and this account can't create it"
  add_role roles/artifactregistry.admin; missing=1
fi

# ---- Permissions ------------------------------------------------------------------------------
if [ -z "$token" ]; then
  row "Permissions" "❔" "couldn't get an access token to check, carrying on"
elif have=$(granted_perms "https://cloudresourcemanager.googleapis.com/v1/projects/$PROJECT_ID:testIamPermissions" "${PROJECT_PERMS[@]}"); then
  for p in "${PROJECT_PERMS[@]}"; do
    if grep -qx "$p" <<<"$have"; then
      row "\`$p\`" "✅" ""
    else
      row "\`$p\`" "❌" "not granted"
      missing=1
      case $p in
        run.*) add_role roles/run.admin ;;
        artifactregistry.*) add_role roles/artifactregistry.writer ;;
      esac
    fi
  done
else
  row "Project permissions" "❔" "couldn't check (the Cloud Resource Manager API may be off), carrying on"
fi

if [ -n "$token" ]; then
  if actas=$(granted_perms "https://iam.googleapis.com/v1/projects/$PROJECT_ID/serviceAccounts/$SA_EMAIL:testIamPermissions" iam.serviceAccounts.actAs); then
    if grep -qx iam.serviceAccounts.actAs <<<"$actas"; then
      row "Run the service as \`$SA_EMAIL\`" "✅" ""
    else
      row "Run the service as \`$SA_EMAIL\`" "❌" "needs \`iam.serviceAccounts.actAs\` on itself"
      need_actas=1; missing=1
    fi
  else
    row "Run the service as itself" "❔" "couldn't check, carrying on"
  fi
fi

# artifactregistry.admin includes writer; don't ask for both.
if printf '%s\n' "${need_roles[@]}" | grep -qx roles/artifactregistry.admin; then
  need_roles=("${need_roles[@]/roles\/artifactregistry.writer/}")
fi

# ---- Report -----------------------------------------------------------------------------------
{
  echo "### Google Cloud access check"
  echo ""
  echo "Project \`$PROJECT_ID\` · account \`$SA_EMAIL\` · region \`$REGION\`"
  echo ""
  echo "| Check | | |"
  echo "| --- | --- | --- |"
  printf '%s\n' "${rows[@]}"
  echo ""
  if [ "$missing" = 1 ]; then
    echo "**This account can't deploy yet.** Send the message below to whoever manages the project, then re-run this workflow."
    echo ""
    echo '```text'
    echo "Hi! I'd like to host a small personal web app (Discogs Preview) on Cloud Run in the"
    echo "project $PROJECT_ID, deployed by the service account $SA_EMAIL."
    echo "It runs as a single instance that scales to zero, so it should stay within the free tier."
    echo "Could you check billing is enabled on the project and run these commands?"
    echo ""
    if [ ${#need_apis[@]} -gt 0 ]; then
      echo "gcloud services enable ${need_apis[*]} --project $PROJECT_ID"
    fi
    for r in "${need_roles[@]}"; do
      [ -n "$r" ] && echo "gcloud projects add-iam-policy-binding $PROJECT_ID --member serviceAccount:$SA_EMAIL --role $r --condition None"
    done
    if [ "$need_actas" = 1 ]; then
      echo "gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL --member serviceAccount:$SA_EMAIL --role roles/iam.serviceAccountUser --project $PROJECT_ID"
    fi
    echo '```'
  else
    echo "Looks good. Building and deploying."
  fi
  echo ""
} >>"$SUMMARY"

exit "$missing"
