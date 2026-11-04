#!/usr/bin/env bash
# One-time setup, run in Google Cloud Shell by the project owner.
# Lets GitHub Actions in cocoadang/itbody (main branch only) deploy the existing Cloud Run
# service pt-journey and the itbody-cocoadang Hosting site without any stored key
# (Workload Identity Federation). Idempotent: safe to re-run.
# It does NOT deploy code, does NOT change the service and does NOT print secret values.
set -euo pipefail

REPO="cocoadang/itbody"
PROJECT_ID="${PROJECT_ID:-gen-lang-client-0064554427}"
SERVICE="${SERVICE:-pt-journey}"
REGION="${REGION:-asia-south1}"
gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

SERVICE_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
RUNTIME_SA="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(spec.template.spec.serviceAccountName)')"
RUNTIME_SA="${RUNTIME_SA:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"
echo "서비스: $SERVICE ($REGION) $SERVICE_URL / 실행 계정: $RUNTIME_SA"

gcloud services enable artifactregistry.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  run.googleapis.com firebasehosting.googleapis.com --quiet

# 1) Image repository.
AR_REPO="itbody-images"
gcloud artifacts repositories describe "$AR_REPO" --location "$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$AR_REPO" --repository-format=docker --location "$REGION" --description="itbody images" --quiet

# 2) Deploy service account. Other apps share this project, so Cloud Run write access is
#    granted on the pt-journey service only; project-level access is read-only.
DEPLOY_SA="itbody-github-deploy@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$DEPLOY_SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create itbody-github-deploy --display-name="itbody GitHub deploy" --quiet
retry() { for i in 1 2 3 4 5 6; do "$@" && return 0; echo "IAM 반영 대기 중... ($i/6)"; sleep 10; done; return 1; }
retry gcloud run services add-iam-policy-binding "$SERVICE" --region "$REGION" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/run.developer --quiet >/dev/null
for ROLE in roles/run.viewer roles/firebasehosting.admin roles/serviceusage.serviceUsageConsumer roles/logging.viewer; do
  retry gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$DEPLOY_SA" --role="$ROLE" --condition=None --quiet >/dev/null
done
retry gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser --quiet >/dev/null
retry gcloud artifacts repositories add-iam-policy-binding "$AR_REPO" --location "$REGION" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/artifactregistry.writer --quiet >/dev/null

# 3) GitHub OIDC trust limited to this repository's main branch.
POOL="itbody-github"; PROVIDER="github-main"
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="itbody GitHub" --quiet
gcloud iam workload-identity-pools providers describe "$PROVIDER" --workload-identity-pool="$POOL" --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --workload-identity-pool="$POOL" --location=global \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='${REPO}' && assertion.ref=='refs/heads/main'" --quiet
retry gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" \
  --quiet >/dev/null

echo
echo "=== 완료. 아래 한 줄을 Claude 에게 붙여넣어 주세요 ==="
echo "ITBODY_DEPLOY project=$PROJECT_ID number=$PROJECT_NUMBER region=$REGION service=$SERVICE url=$SERVICE_URL"
