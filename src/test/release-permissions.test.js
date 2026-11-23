import { readFileSync } from "node:fs";
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
  expect(publisher.run).toContain("gh release upload");
});
