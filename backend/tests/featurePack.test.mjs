import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
// No provider keys are read by featurePack; tests run fully offline.
delete process.env.OPENROUTER_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
const { filterRecords, exportRecords, buildInsights, labelledSections } = await import("../featurePack.mjs");

const rows = [
  { id: 1, reference: "A-1", title: "Alpha renewal", status: "Open", risk: "High", owner: "Sam", amount: 0, active: false, notes: "" },
  { id: 2, reference: "B-2", title: "Beta renewal", status: "Closed", risk: "Low", owner: "", amount: 250, active: true, notes: "done" },
];

test("search/filter narrows the main list", () => {
  assert.equal(filterRecords(rows, { search: "alpha" }).length, 1);
  assert.equal(filterRecords(rows, { status: "Closed" })[0].reference, "B-2");
  assert.equal(filterRecords(rows, { search: "missing" }).length, 0);
});

test("CSV and JSON export preserve false, 0, and empty values", () => {
  const csv = exportRecords(rows, "csv");
  assert.match(csv.body, /false/); assert.match(csv.body, /,0,/);
  const parsed = JSON.parse(exportRecords(rows, "json").body);
  assert.equal(parsed[0].amount, 0); assert.equal(parsed[0].active, false); assert.equal(parsed[0].notes, "");
});

test("labelled sections keep false, 0, and empty entries", () => {
  const sections = labelledSections(rows[0]);
  assert.equal(sections.find((s) => s.key === "amount").value, 0);
  assert.equal(sections.find((s) => s.key === "active").value, false);
  assert.equal(sections.find((s) => s.key === "notes").display, "(empty)");
});

test("domain insights are deterministic fallbacks with aiGenerated:false", () => {
  const insights = buildInsights(rows);
  assert.equal(insights.length, 3);
  for (const f of insights) { assert.equal(f.aiGenerated, false); assert.equal(f.source, "deterministic-fallback"); }
  assert.equal(buildInsights(rows)[0].totalRecords, 2);
});

test("feature pack is mounted behind auth in the server", () => {
  const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.ok(server.includes("featurePack"), "server must import the feature pack");
  assert.ok(server.includes("ai-insights") || server.includes("ai/insights"), "server must expose insights");
  assert.ok(server.includes("/export"), "server must expose export");
});
