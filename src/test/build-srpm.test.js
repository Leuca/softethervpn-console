import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

const name = "softethervpn-console";
const version = "1.2.3-rc.1";
const asset = name + "-1.2.3.rc.1-1.fc99.src.rpm";
const tmp = mkdtempSync(join(tmpdir(), "srpm-test-"));
const repo = join(tmp, "repo");
const env = {
  HOME: tmp, TMPDIR: tmp, PATH: join(tmp, "bin") + ":" + process.env.PATH,
  GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "test@example.invalid",
  GITHUB_STEP_SUMMARY: join(tmp, "summary"), GITHUB_REPOSITORY: "fixture/" + name,
};
const git = (...args) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8" }).trim();
const build = (...args) => spawnSync("bash", [join(repo, "packaging/build-srpm.sh"), version, tmp, ...args],
  { cwd: tmp, env, encoding: "utf8" });
let previous, commit, annotation;

beforeAll(() => {
  writeFileSync(env.GITHUB_STEP_SUMMARY, "");
  for (const dir of ["repo/packaging", "repo/gateway", "bin"]) mkdirSync(join(tmp, dir), { recursive: true });
  for (const file of ["build-srpm.sh", "generate-bundled-provides.mjs", name + ".spec"]) {
    copyFileSync("packaging/" + file, join(repo, "packaging", file));
  }
  for (const file of [name + ".service", name + ".sysconfig"]) writeFileSync(join(repo, "packaging", file), "");
  for (const file of ["package-lock.json", "gateway/package-lock.json"]) writeFileSync(join(repo, file), "{}");
  const stub = (command, body) => writeFileSync(join(tmp, "bin", command), "#!/bin/bash\nset -eu\n" + body, { mode: 0o755 });
  stub("curl", "exit 90");
  stub("npm", `touch "$4/${name}-${version}.tgz"`);
  stub("nodejs-packaging-bundler", 'mkdir -p "$HOME/rpmbuild/SOURCES"\ntouch "$HOME/rpmbuild/SOURCES"/pkg-{nm-prod.tgz,nm-dev.tgz,bundled-licenses.txt}');
  stub("rpmlint", "exit 0");
  stub("rpmbuild", `top="$(dirname "$(dirname "$4")")"
cp "$4" "$TMPDIR/rendered.spec"
mkdir -p "$top/SRPMS"
cp "$top"/SOURCES/*.tar.gz "$top/SRPMS/${name}-1.2.3~rc.1-1.fc99.src.rpm"`);

  git("init", "--quiet");
  writeFileSync(join(repo, "marker"), "local release");
  git("add", "packaging", "gateway", "package-lock.json", "marker");
  git("commit", "-qm", "Local release");
  previous = git("rev-parse", "HEAD");
  git("tag", "v" + version);
  writeFileSync(join(repo, "marker"), "event release");
  git("commit", "-qam", "Event release");
  commit = git("rev-parse", "HEAD");
  git("tag", "-a", "event", "-m", "Annotated event");
  annotation = git("rev-parse", "refs/tags/event");
  writeFileSync(join(repo, "marker"), "uncommitted");
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function checkArchive(oid, marker) {
  const prefix = name + "-" + oid;
  const spec = readFileSync(join(tmp, "rendered.spec"), "utf8");
  expect(spec).toContain("Source0:        https://github.com/fixture/" + name + "/archive/" + oid + "/" + prefix + ".tar.gz");
  expect(spec).toContain("%autosetup -n " + prefix + "\n");
  expect(execFileSync("tar", ["-xOzf", join(tmp, asset), prefix + "/marker"], { encoding: "utf8" })).toBe(marker);
  execFileSync("sha256sum", ["--check", asset + ".sha256"], { cwd: tmp });
  expect(readFileSync(env.GITHUB_STEP_SUMMARY, "utf8").trimEnd().split("\n").at(-1)).toContain(oid);
}

it.each(["commit", "annotated tag"])("uses the peeled event %s, independently of the version tag and dirty files", (kind) => {
  const result = build(kind === "commit" ? commit : annotation);
  expect(result.status, result.stderr).toBe(0);
  checkArchive(commit, "event release");
});

it("uses the local version tag when no expected checkout is supplied", () => {
  const result = build();
  expect(result.status, result.stderr).toBe(0);
  checkArchive(previous, "local release");
});

it("rejects a different commit, absent object, ref name, or empty event ID before packaging", () => {
  const summary = readFileSync(env.GITHUB_STEP_SUMMARY, "utf8");
  for (const oid of [previous, "0".repeat(40), "HEAD", ""]) {
    const result = build(oid);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/does not match|Needed a single revision|full release event object ID/);
  }
  expect(readFileSync(env.GITHUB_STEP_SUMMARY, "utf8")).toBe(summary);
});
