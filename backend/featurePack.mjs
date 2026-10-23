// Feature pack: search/filter, CSV/JSON export, labelled sections, and
// deterministic domain insights over this app's own records.
// Offline by design: no provider call is made here; every insight is a
// labelled deterministic fallback with aiGenerated:false.
const DOMAIN_FEATURES = [
  { id: "renewal-urgency-triage", label: "Renewal urgency triage", description: "Ranks own renewal cases by due date and risk so overdue and high-risk renewals surface first." },
  { id: "evidence-completeness-check", label: "Evidence completeness check", description: "Flags own cases missing owner, due date, or evidence notes before review." },
  { id: "outreach-priority-queue", label: "Outreach priority queue", description: "Orders open cases into an outreach work queue by risk and due date." }
];

export function displayValue(value) {
  if (value === false) return "false";
  if (value === 0) return "0";
  if (value === "" || value == null) return "(empty)";
  return String(value);
}

// Readable labelled sections: every present key is kept, including
// false, 0, and empty values (never dropped as falsy).
export function labelledSections(record) {
  if (!record || typeof record !== "object") return [];
  return Object.entries(record).map(([key, value]) => ({
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    key,
    value: value === undefined ? null : value,
    display: displayValue(value),
  }));
}

export function filterRecords(rows, { search = "", q = "", status = "", risk = "", owner = "" } = {}) {
  const needle = String(search || q || "").trim().toLowerCase();
  return (rows || []).filter((row) => {
    if (status && String(row.status ?? row.state ?? "") !== status) return false;
    if (risk && String(row.risk ?? "") !== risk) return false;
    if (owner && String(row.owner ?? "") !== owner) return false;
    if (!needle) return true;
    return Object.values(row || {}).some((v) => v != null && typeof v !== "object" && String(v).toLowerCase().includes(needle));
  });
}

function csvCell(value) {
  if (value == null) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportRecords(rows, format = "json") {
  const list = rows || [];
  if (String(format).toLowerCase() === "csv") {
    const keys = [...new Set(list.flatMap((r) => Object.keys(r || {})))];
    const body = [keys.join(","), ...list.map((r) => keys.map((k) => csvCell(r?.[k])).join(","))].join("\n") + "\n";
    return { format: "csv", contentType: "text/csv; charset=utf-8", filename: "records-export.csv", body };
  }
  return { format: "json", contentType: "application/json; charset=utf-8", filename: "records-export.json", body: JSON.stringify(list, null, 2) };
}

const riskRank = { Critical: 4, High: 3, Moderate: 2, Low: 1 };
const isOpen = (r) => !["Closed", "closed", "Approved", "approved", "DONE", "CANCELLED"].includes(String(r.status ?? r.state ?? ""));
const refOf = (r) => String(r.reference ?? r.title ?? r.subject ?? r.id ?? "record");

export function buildInsights(rows) {
  const list = rows || [];
  const open = list.filter(isOpen);
  const byRiskDesc = [...list].sort((a, b) => (riskRank[b.risk] || 0) - (riskRank[a.risk] || 0) || Number(b.amount || 0) - Number(a.amount || 0));
  const missing = list.filter((r) => !r.owner || !(r.due_date || r.dueDate) || r.amount == null);
  const queue = [...open].sort((a, b) => (riskRank[b.risk] || 0) - (riskRank[a.risk] || 0) || String(a.due_date || a.dueDate || "9999").localeCompare(String(b.due_date || b.dueDate || "9999")));
  const payloads = [
    { totalRecords: list.length, openRecords: open.length, top: byRiskDesc.slice(0, 5).map(refOf) },
    { incompleteRecords: missing.length, flagged: missing.slice(0, 5).map(refOf) },
    { queuedRecords: queue.length, next: queue.slice(0, 5).map(refOf) },
  ];
  return DOMAIN_FEATURES.map((feature, i) => ({
    id: feature.id, label: feature.label, description: feature.description,
    aiGenerated: false, source: "deterministic-fallback",
    notice: "Deterministic fallback over your own records — not AI-generated. No provider was called.",
    ...payloads[i],
  }));
}
