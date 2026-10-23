import React, { useEffect, useState } from "react";

function displayValue(value) {
  if (value === false) return "false";
  if (value === 0) return "0";
  if (value === "" || value == null) return "(empty)";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function FeaturePack({ request, recordsPath, exportPath, insightsPath }) {
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("");
  const [items, setItems] = useState([]); const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState(""); const [insights, setInsights] = useState(null);
  const [error, setError] = useState("");
  async function loadRecords() {
    try { const data = await request(`${recordsPath}?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`); setItems(data.items || []); } catch (e) { setError(e.message); }
  }
  async function loadTasks() { try { const data = await request("/api/tasks"); setTasks(data.tasks || []); } catch (e) { setError(e.message); } }
  useEffect(() => { loadRecords(); loadTasks(); }, []);
  async function download(format) {
    const token = localStorage.getItem("domain_recovery_token") || localStorage.getItem("portfolio_token");
    const res = await fetch(`${exportPath}?format=${format}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const blob = await res.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `records-export.${format}`; a.click(); URL.revokeObjectURL(url);
  }
  async function createTask(event) { event.preventDefault(); await request("/api/tasks", { method: "POST", body: JSON.stringify({ title }) }); setTitle(""); loadTasks(); }
  async function runInsights() { try { const data = await request(insightsPath, { method: "POST", body: "{}" }); setInsights(data.insights || []); } catch (e) { setError(e.message); } }
  return <section aria-label="Tasks, search, export and insights">
    <h2>Tasks, search, export &amp; insights</h2>
    {error && <p role="alert">{error}</p>}
    <div>
      <label htmlFor="fp-search">Search records</label>
      <input id="fp-search" value={search} onChange={(e) => setSearch(e.target.value)} />
      <label htmlFor="fp-status">Status filter</label>
      <input id="fp-status" value={status} onChange={(e) => setStatus(e.target.value)} />
      <button type="button" onClick={loadRecords}>Apply search / filter</button>
      <button type="button" onClick={() => download("csv")}>Export CSV</button>
      <button type="button" onClick={() => download("json")}>Export JSON</button>
    </div>
    <section aria-label="Record sections">
      <h3>Records ({items.length})</h3>
      {items.slice(0, 10).map((item, i) => <article key={item.id ?? i}><dl>{Object.entries(item).slice(0, 8).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{displayValue(v)}</dd></div>)}</dl></article>)}
    </section>
    <section aria-label="Staff tasks">
      <h3>Staff tasks</h3>
      <form onSubmit={createTask}><label htmlFor="fp-task">New task title</label><input id="fp-task" value={title} onChange={(e) => setTitle(e.target.value)} required /><button type="submit">Create task</button></form>
      <ul>{tasks.map((t) => <li key={t.id}><span>{t.title} — {displayValue(t.status)}</span> <button type="button" onClick={async () => { await request(`/api/tasks/${t.id}`, { method: "PATCH", body: JSON.stringify({ status: t.status === "DONE" ? "OPEN" : "DONE" }) }); loadTasks(); }}>Mark {t.status === "DONE" ? "open" : "done"}</button></li>)}</ul>
    </section>
    <section aria-label="Deterministic insights">
      <h3>Domain insights</h3>
      <button type="button" onClick={runInsights}>Run deterministic insights</button>
      {insights && insights.map((f) => <article key={f.id}><h4>{f.label}</h4><p>{f.description}</p><p>aiGenerated: {displayValue(f.aiGenerated)} — {f.notice}</p><dl>{Object.entries(f).filter(([k]) => !["id","label","description","notice"].includes(k)).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{displayValue(v)}</dd></div>)}</dl></article>)}
    </section>
  </section>;
}
