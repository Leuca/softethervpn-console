import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { parsers } from "prettier/plugins/yaml";
import { expect, it } from "vitest";

// Use the project's YAML parser; keep only mappings, sequences and scalar text.
function value(node) {
  if (node.type === "mapping") {
    return Object.fromEntries(node.children.map((pair) => pair.children.map(value)));
  }
  if (["sequence", "flowSequence"].includes(node.type)) return node.children.map(value);
  if ("value" in node) return node.value;
  return value(node.children[0]);
}

const yaml = readFileSync(".github/workflows/release.yaml", "utf8");
const ast = await parsers.yaml.parse(yaml, {});
const workflow = value(ast.children[0].children.find((part) => part.type === "documentBody"));
const { publish } = workflow.jobs;

it("grants repository write access only to the isolated publisher", () => {
  expect(workflow.permissions).toEqual({ contents: "read" });
  for (const [name, job] of Object.entries(workflow.jobs)) {
    if (name === "publish") continue;
    expect(job.permissions ?? workflow.permissions).toEqual({ contents: "read" });
    const checkouts = job.steps.filter((step) => step.uses?.startsWith("actions/checkout@"));
    for (const step of checkouts) expect(step.with?.["persist-credentials"]).toBe("false");
    expect(JSON.stringify(job)).not.toMatch(/GH_TOKEN|github\.token|secrets\.|gh release/);
  }
  expect(publish.permissions).toEqual({ contents: "write" });
  expect(publish["runs-on"]).toBe("ubuntu-latest");
  expect(publish.container).toBeUndefined();
  expect(publish.services).toBeUndefined();
});

it("hands off both named artifacts into separate data directories without a publisher checkout", () => {
  expect(publish.needs).toEqual(["release", "srpm"]);
  const downloads = publish.steps.slice(0, -1);
  expect(downloads).toHaveLength(2);
  for (const [index, job] of publish.needs.entries()) {
    const upload = workflow.jobs[job].steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
    const name = ["release-bundles", "release-srpm"][index];
    expect(upload.with.name).toBe(name);
    expect(upload.with.path).not.toMatch(/[*?]/);
    expect(downloads[index].uses).toMatch(/^actions\/download-artifact@/);
    expect(downloads[index].with).toEqual({ name, path: "${{ runner.temp }}/" + name });
  }
  const publisher = publish.steps.at(-1);
  expect(publisher.shell).toBe("bash");
  expect(publisher.run).not.toMatch(/\$\{\{|\b(?:eval|source|bash|sh|npm|node|tar|unzip)\s|sha256sum --check/);
  expect(publish.concurrency).toEqual({ group: "release-publish-${{ github.ref }}", "cancel-in-progress": "false" });
  expect(publisher.env.IMMUTABLE_RELEASES_CONFIRMED).toBe("${{ vars.IMMUTABLE_RELEASES_CONFIRMED }}");
});

// Exercise the actual shell with canned API replies. No credentials, network CLI or checkout on PATH.
function checkPublication({ tag = "v1.2.3", notes = false, confirmed = true, success = false }, plan) {
  const dir = mkdtempSync(join(tmpdir(), "release-test-"));
  try {
    for (const subdir of ["bin", "release-bundles", "release-srpm"]) mkdirSync(join(dir, subdir));
    for (const cmd of ["jq", "sha256sum", "cmp"]) symlinkSync("/usr/bin/" + cmd, join(dir, "bin", cmd));
    symlinkSync("/usr/bin/true", join(dir, "bin", "sleep"));
    const version = tag.slice(1);
    const rpm = "softethervpn-console-" + version.replace("-", ".") + "-1.fc42.src.rpm";
    const paths = [
      join(dir, "release-bundles", "softethervpn-console-" + tag + ".tar.gz"),
      join(dir, "release-bundles", "softethervpn-console-managed-" + tag + ".tar.gz"),
      join(dir, "release-srpm", rpm),
    ];
    const hash = (s) => createHash("sha256").update(s).digest("hex");
    const assets = [];
    for (const path of paths) {
      const name = basename(path);
      const data = "fixture " + name;
      const sum = hash(data);
      const sidecar = sum + "  " + name + "\n";
      writeFileSync(path, data);
      writeFileSync(path + ".sha256", sidecar);
      assets.push({ name, digest: "sha256:" + sum, state: "uploaded" });
      assets.push({ name: name + ".sha256", digest: "sha256:" + hash(sidecar), state: "uploaded" });
    }
    const notesFile = join(dir, "release-bundles", "RELEASE_NOTES_1.2.3.md");
    if (notes) writeFileSync(notesFile, "Synthetic notes\n");
    const calls = [];
    function api(command, response = {}, fail = false) {
      const i = calls.length;
      calls.push("api " + command);
      writeFileSync(join(dir, "reply" + i), JSON.stringify(response));
      if (fail) writeFileSync(join(dir, "fail" + i), "");
    }
    const repo = "repos/example/project";
    const base = repo + "/releases";
    const draft = { id: 41, draft: true, tag_name: tag };
    const prerelease = version.includes("-");
    plan({
      assets, draft,
      list: (pages, fail) => api("--paginate --slurp " + base + "?per_page=100", pages, fail),
      create: () => {
        api(repo + "/git/ref/tags/" + tag + " --silent");
        api(base + " -f tag_name=" + tag + " -F draft=true -F prerelease=" + prerelease +
          " -f name=SoftEther VPN Console " + tag + " -F " + (notes ? "body=@" + notesFile : "generate_release_notes=true"), draft);
      },
      read: (existing, overrides) => api(base + "/41", { ...draft, assets: existing, ...overrides }),
      upload: (i, fail) => {
        const path = paths[Math.floor(i / 2)] + (i % 2 ? ".sha256" : "");
        api("--method POST https://uploads.github.com/" + base + "/41/assets?name=" + basename(path) +
          " -H Content-Type: application/octet-stream --input " + path + " --silent", {}, fail);
      },
      publish: () => api("--method PATCH " + base + "/41 -F draft=false -F prerelease=" + prerelease + " --silent"),
    });

    writeFileSync(join(dir, "index"), "0\n");
    writeFileSync(join(dir, "calls"), "");
    const gh = `gh() {
      local i=$(< "$RUNNER_TEMP/index")
      printf '%s\\n' "$*" >> "$RUNNER_TEMP/calls"
      printf '%s\\n' "$((i + 1))" > "$RUNNER_TEMP/index"
      [[ -f "$RUNNER_TEMP/reply$i" ]] || return 99
      printf '%s\\n' "$(< "$RUNNER_TEMP/reply$i")"
      [[ ! -f "$RUNNER_TEMP/fail$i" ]]
    }`;
    const result = spawnSync("/bin/bash", ["--norc", "-eo", "pipefail", "-c", gh + "\n" + publish.steps.at(-1).run], {
      cwd: dir, encoding: "utf8", timeout: 5000,
      env: { PATH: join(dir, "bin"), RUNNER_TEMP: dir, GH_REPO: "example/project", GITHUB_REF_NAME: tag,
        SRPM_NAME: rpm, IMMUTABLE_RELEASES_CONFIRMED: String(confirmed) },
    });
    expect(result.error).toBeUndefined();
    expect(success ? [0] : [1, 5], result.stderr).toContain(result.status);
    expect(readFileSync(join(dir, "calls"), "utf8")).toBe(calls.map((c) => c + "\n").join(""));
    return result.stderr;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

it.each(["v1.2.3", "v1.2.3-rc.1"])("creates a draft and verifies all six assets before publishing %s", (tag) => {
  checkPublication({ tag, notes: tag.includes("-"), success: true }, ({ assets, draft, list, create, read, upload, publish }) => {
    list([[]]);
    create();
    if (tag.includes("-")) list([[]]);
    list([[draft]]);
    for (let i = 0; i < assets.length; ++i) {
      read(assets.slice(0, i));
      upload(i);
    }
    list([[draft]]);
    read(assets);
    publish();
  });
});

it.each(["still missing", "different ID", "API failure"])("stops before upload when the new draft lookup reports %s", (scenario) => {
  const stderr = checkPublication({}, ({ draft, list, create }) => {
    list([[]]);
    create();
    if (scenario === "different ID") return list([[{ ...draft, id: 42 }]]);
    if (scenario === "API failure") return list([[]], true);
    for (let i = 0; i < 5; i++) list([[]]);
  });
  if (scenario === "different ID") expect(stderr).toContain("expected 41, observed 42");
  if (scenario === "still missing") expect(stderr).toContain("5/5 for v1.2.3: expected 41, observed missing");
  if (scenario === "API failure") expect(stderr).toMatch(/Publish release failed at shell line \d+ \(exit 1\)/);
});

it("resumes a paginated draft, uploading only its missing sidecar", () => {
  checkPublication({ success: true }, ({ draft, assets, list, read, upload, publish }) => {
    list([[], [draft]]);
    for (const _ of assets) read(assets.slice(0, -1));
    upload(5);
    list([[draft]]);
    read(assets);
    publish();
  });
});

it("requires confirmation before any API call", () => checkPublication({ confirmed: false }, () => {}));

it.each(["lookup failure", "published", "ambiguous", "competing creation", "digest mismatch", "missing digest", "duplicate upload",
  "published between uploads", "incomplete at publish"])("stops on %s without further writes", (scenario) => {
  checkPublication({}, ({ draft, assets, list, create, read, upload }) => {
    if (scenario === "lookup failure") return list([[]], true);
    if (scenario === "published") return list([[{ ...draft, draft: false }]]);
    if (scenario === "ambiguous") return list([[draft, draft]]);
    if (scenario === "competing creation") {
      list([[]]);
      create();
      return list([[draft, { ...draft, id: 42 }]]);
    }
    list([[draft]]);
    if (scenario === "digest mismatch") return read([{ ...assets[1], digest: assets[0].digest }]);
    if (scenario === "missing digest") return read([{ ...assets[0], digest: null }]);
    if (scenario === "incomplete at publish") {
      for (const _ of assets) read(assets);
      list([[draft]]);
      return read(assets.slice(1));
    }
    read([]);
    upload(0, scenario === "duplicate upload");
    if (scenario === "published between uploads") read([assets[0]], { draft: false });
  });
});
