import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsers } from "prettier/plugins/yaml";
import { expect, it } from "vitest";

function value(node) {
  if (node.type === "mapping") {
    return Object.fromEntries(node.children.map((pair) => pair.children.map(value)));
  }
  if (node.type === "sequence") return node.children.map(value);
  return "value" in node ? node.value : value(node.children[0]);
}

const yaml = readFileSync(".github/workflows/label-pf-team-issues.yml", "utf8");
const ast = await parsers.yaml.parse(yaml, {});
const workflow = value(ast.children[0].children.find((part) => part.type === "documentBody"));
const { label } = workflow.jobs;
const [check, apply] = label.steps;

it("isolates the membership credential and gates the issues-only label write", () => {
  expect(workflow.on).toEqual({ issues: { types: ["opened"] } });
  expect(label.permissions).toEqual({ issues: "write" });
  expect(yaml).not.toMatch(/^\s*(uses|secrets):/m);
  expect(yaml.match(/secrets\./g)).toHaveLength(1);
  expect(check.env).toEqual({
    GH_TOKEN: "${{ secrets.GH_READ_ORG_TOKEN }}",
    ISSUE_AUTHOR: "${{ github.event.issue.user.login }}",
  });
  expect(apply.if).toBe(`steps.${check.id}.outputs.active == 'true'`);
  expect(apply.env).toEqual({
    GH_TOKEN: "${{ github.token }}",
    ISSUE_NUMBER: "${{ github.event.issue.number }}",
  });
  expect(check.run + apply.run).not.toContain("${{");
});

it.each([
  ["unconfigured", "", 200, "active", 0, false],
  ["active", "fixture", 200, "active", 0, true],
  ["pending", "fixture", 200, "pending", 0, false],
  ["not found", "fixture", 404, "", 0, false],
  ["forbidden", "fixture", 403, "", 1, false],
])("%s membership", (_, token, http, state, status, active) => {
  const dir = mkdtempSync(join(tmpdir(), "pf-membership-"));
  const output = join(dir, "output");
  try {
    const gh = `gh() {
      printf '%s\n' "$@" >&2
      printf 'HTTP/2.0 %s Status\nContent-Type: application/json\r\n\r\n%s\n' "$HTTP" "$STATE"
      [[ "$HTTP" == 200 ]]
    }`;
    const result = spawnSync("/bin/bash", ["-e", "-c", gh + "\n" + check.run], {
      env: { PATH: "", GH_TOKEN: token, ISSUE_AUTHOR: "example", HTTP: String(http), STATE: state, GITHUB_OUTPUT: output },
      encoding: "utf8",
    });
    expect(result.status).toBe(status);
    expect(result.stderr.trim()).toBe(
      token ? "api\n--include\n--jq\n.state\norgs/patternfly/teams/frequent-flyers/memberships/example" : "",
    );
    expect(existsSync(output) ? readFileSync(output, "utf8") : "").toBe(active ? "active=true\n" : "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("adds only PF Team to the opened issue", () => {
  const result = spawnSync("/bin/bash", ["-e", "-c", 'gh() { printf "%s\\n" "$@"; }\n' + apply.run], {
    env: { PATH: "", GITHUB_REPOSITORY: "example/repo", ISSUE_NUMBER: "7" },
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  expect(result.stdout.trim().split("\n")).toEqual([
    "api", "--method", "POST", "repos/example/repo/issues/7/labels", "-f", "labels[]=PF Team", "--silent",
  ]);
});
