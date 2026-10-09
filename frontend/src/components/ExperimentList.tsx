import { FormEvent, useEffect, useState } from "react";
import { ApiError, createExperiment, listExperiments } from "../api/experiments";
import type { ExperimentInput, ExperimentSummary } from "../types/experiment";

function lifecycle(experiment: ExperimentSummary) {
  if (!experiment.started_at) return "Planned";
  return experiment.ended_at ? "Completed" : "In progress";
}

const initialForm: ExperimentInput = {
  name: "",
  description: null,
  hypothesis: null,
  started_at: null,
  ended_at: null,
};

export default function ExperimentList() {
  const [experiments, setExperiments] = useState<ExperimentSummary[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void listExperiments()
      .then(({ experiments: items }) => setExperiments(items))
      .catch(() => setError("Unable to load experiments."))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("An experiment name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const created = await createExperiment({ ...form, name: form.name.trim() });
      setExperiments((items) => [created, ...items]);
      setForm(initialForm);
      setMessage("Planned experiment created.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Unable to create experiment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="experiment-list panel" aria-labelledby="experiments-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Fermentations</p>
          <h2 id="experiments-heading">Experiments</h2>
        </div>
      </div>
      <form className="management-form" onSubmit={submit}>
        <label>New experiment<input aria-label="New experiment name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Description<input aria-label="New experiment description" value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value || null })} /></label>
        <button type="submit" disabled={saving}>{saving ? "Creating…" : "Create planned experiment"}</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
      {loading ? <p>Loading experiments…</p> : experiments.length === 0 ? <p>No experiments yet.</p> : (
        <ul className="experiment-items">
          {experiments.map((experiment) => <li key={experiment.id}>
            <a href={`/experiments/${experiment.id}`}>{experiment.name}</a>
            <span className={`lifecycle lifecycle-${lifecycle(experiment).toLowerCase().replace(" ", "-")}`}>{lifecycle(experiment)}</span>
          </li>)}
        </ul>
      )}
    </section>
  );
}
