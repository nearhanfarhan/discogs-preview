import { spawnSync } from "child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Runs deploy/preflight.sh against fake `gcloud` and `curl` commands whose behaviour is
 * driven by FAKE_* environment variables, so every access scenario can be exercised offline.
 */

const SCRIPT = path.resolve(__dirname, "../deploy/preflight.sh");
const ALL_PERMS = [
  "run.services.create",
  "run.services.update",
  "run.services.get",
  "run.services.setIamPolicy",
  "artifactregistry.repositories.uploadArtifacts",
];

const FAKE_GCLOUD = `#!/usr/bin/env bash
echo "gcloud $*" >> "$FAKE_LOG"
case "$1 $2" in
  "auth print-access-token") [ -n "\${FAKE_NO_TOKEN:-}" ] && exit 1; echo fake-token ;;
  "services list") [ -n "\${FAKE_LIST_FAIL:-}" ] && exit 1; printf '%b\\n' "\${FAKE_ENABLED:-}" ;;
  "services enable") [ "\${FAKE_CAN_ENABLE:-}" = 1 ] || exit 1 ;;
  "artifacts repositories")
    case "$3" in
      describe) [ "\${FAKE_REPO_EXISTS:-}" = 1 ] || exit 1 ;;
      create) [ "\${FAKE_CAN_CREATE_REPO:-}" = 1 ] || exit 1 ;;
    esac ;;
  *) echo "unexpected gcloud call: $*" >&2; exit 2 ;;
esac
`;

const FAKE_CURL = `#!/usr/bin/env bash
url="\${@: -1}"
case "$url" in
  *cloudresourcemanager*) [ -n "\${FAKE_PROJECT_CHECK_FAIL:-}" ] && exit 22; echo "{\\"permissions\\": \${FAKE_PROJECT_PERMS:-[]}}" ;;
  *iam.googleapis.com*) [ "\${FAKE_ACTAS:-}" = 1 ] && echo '{"permissions":["iam.serviceAccounts.actAs"]}' || echo '{}' ;;
  *) exit 6 ;;
esac
`;

let dir: string;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

function run(fake: Record<string, string>) {
  dir = mkdtempSync(path.join(tmpdir(), "preflight-"));
  for (const [name, body] of [["gcloud", FAKE_GCLOUD], ["curl", FAKE_CURL]]) {
    writeFileSync(path.join(dir, name), body);
    chmodSync(path.join(dir, name), 0o755);
  }
  const summary = path.join(dir, "summary.md");
  const log = path.join(dir, "calls.log");
  writeFileSync(log, "");
  const res = spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      PROJECT_ID: "their-project",
      REGION: "europe-west2",
      REPOSITORY: "discogs-preview",
      SA_EMAIL: "deployer@their-project.iam.gserviceaccount.com",
      SUMMARY: summary,
      FAKE_LOG: log,
      ...fake,
    } as unknown as NodeJS.ProcessEnv,
  });
  return { code: res.status, stderr: res.stderr, summary: readFileSync(summary, "utf8"), calls: readFileSync(log, "utf8") };
}

const allGood = {
  FAKE_ENABLED: "run.googleapis.com\\nartifactregistry.googleapis.com\\niam.googleapis.com",
  FAKE_REPO_EXISTS: "1",
  FAKE_PROJECT_PERMS: JSON.stringify(ALL_PERMS),
  FAKE_ACTAS: "1",
};

describe("deploy/preflight.sh", () => {
  it("passes when everything is in place, with no message for the owner", () => {
    const r = run(allGood);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(r.summary).toContain("Looks good");
    expect(r.summary).not.toContain("❌");
    expect(r.summary).not.toContain("gcloud projects add-iam-policy-binding");
  });

  it("enables an API itself when it's allowed to", () => {
    const r = run({ ...allGood, FAKE_ENABLED: "run.googleapis.com", FAKE_CAN_ENABLE: "1" });
    expect(r.code).toBe(0);
    expect(r.calls).toContain("gcloud services enable artifactregistry.googleapis.com");
    expect(r.summary).toContain("was off, enabled it");
  });

  it("asks the owner to enable APIs it can't enable, without asking for extra roles", () => {
    const r = run({ ...allGood, FAKE_ENABLED: "", FAKE_REPO_EXISTS: "" });
    expect(r.code).toBe(1);
    expect(r.summary).toContain(
      "gcloud services enable run.googleapis.com artifactregistry.googleapis.com --project their-project",
    );
    expect(r.summary).toContain("will be checked once the APIs are on");
    expect(r.summary).not.toContain("artifactregistry.admin");
    expect(r.calls).not.toContain("repositories create");
  });

  it("lists the roles needed for missing permissions", () => {
    const r = run({
      ...allGood,
      FAKE_PROJECT_PERMS: JSON.stringify(ALL_PERMS.filter((p) => p !== "run.services.setIamPolicy")),
      FAKE_ACTAS: "",
    });
    expect(r.code).toBe(1);
    expect(r.summary).toMatch(/run.services.setIamPolicy` \| ❌/);
    expect(r.summary).toContain(
      "gcloud projects add-iam-policy-binding their-project --member serviceAccount:deployer@their-project.iam.gserviceaccount.com --role roles/run.admin --condition None",
    );
    expect(r.summary).toContain(
      "gcloud iam service-accounts add-iam-policy-binding deployer@their-project.iam.gserviceaccount.com --member serviceAccount:deployer@their-project.iam.gserviceaccount.com --role roles/iam.serviceAccountUser",
    );
    expect(r.summary).not.toContain("--role roles/artifactregistry");
  });

  it("creates the image repository when it's missing and allowed", () => {
    const r = run({ ...allGood, FAKE_REPO_EXISTS: "", FAKE_CAN_CREATE_REPO: "1" });
    expect(r.code).toBe(0);
    expect(r.calls).toContain("gcloud artifacts repositories create discogs-preview --repository-format docker --location europe-west2");
    expect(r.summary).toContain("created it");
  });

  it("asks for artifactregistry.admin (not writer too) when the repo can't be created", () => {
    const r = run({
      ...allGood,
      FAKE_REPO_EXISTS: "",
      FAKE_PROJECT_PERMS: JSON.stringify(ALL_PERMS.filter((p) => !p.startsWith("artifactregistry"))),
    });
    expect(r.code).toBe(1);
    expect(r.summary).toContain("--role roles/artifactregistry.admin");
    expect(r.summary).not.toContain("--role roles/artifactregistry.writer");
  });

  it("carries on (exit 0) when it can't check, so the deploy's own error can show", () => {
    const r = run({ ...allGood, FAKE_LIST_FAIL: "1", FAKE_PROJECT_CHECK_FAIL: "1" });
    expect(r.code).toBe(0);
    expect(r.summary).toContain("couldn't list enabled APIs");
    expect(r.summary).toContain("couldn't check");
  });
});
