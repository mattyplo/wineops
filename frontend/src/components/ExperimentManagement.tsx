import { FormEvent, useState } from "react";
import {
  ApiError,
  createExperimentEvent,
  deleteExperiment,
  deleteExperimentEvent,
  updateExperiment,
  updateExperimentEvent,
} from "../api/experiments";
import type { ExperimentDetail, ExperimentEvent, ExperimentEventInput } from "../types/experiment";

interface Props {
  experiment: ExperimentDetail;
  onChanged: () => void;
  onDeleted: () => void;
}

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toIso(value: string) {
  return new Date(value).toISOString();
}

export default function ExperimentManagement({ experiment, onChanged, onDeleted }: Props) {
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ExperimentEvent | null>(null);
  const [timeAction, setTimeAction] = useState<"started_at" | "ended_at" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function run(action: () => Promise<unknown>, success: string) {
    setSaving(true); setError(null); setMessage(null);
    try { await action(); setMessage(success); onChanged(); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "Unable to save changes."); }
    finally { setSaving(false); }
  }

  function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(() => updateExperiment(experiment.id, {
      name: String(data.get("name")).trim(),
      description: String(data.get("description")) || null,
      hypothesis: String(data.get("hypothesis")) || null,
    }), "Experiment details saved.");
  }

  function saveTime(field: "started_at" | "ended_at", event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get(field));
    if (!value) { setError("Choose a timestamp before saving."); return; }
    void run(() => updateExperiment(experiment.id, { [field]: toIso(value) }), field === "started_at" ? "Experiment started." : "Experiment ended.");
  }

  function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const occurredAt = String(data.get("occurred_at"));
    if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) {
      setError("Event type, description, and time are required.");
      return;
    }
    const input: ExperimentEventInput = {
      event_type: String(data.get("event_type")).trim(),
      description: String(data.get("event_description")).trim(),
      occurred_at: toIso(occurredAt),
    };
    if (!input.event_type || !input.description) {
      setError("Event type, description, and time are required."); return;
    }
    void run(
      () => editingEvent ? updateExperimentEvent(experiment.id, editingEvent.id, input) : createExperimentEvent(experiment.id, input),
      editingEvent ? "Event updated." : "Event added.",
    );
    setEventOpen(false); setEditingEvent(null);
  }

  function removeExperiment() {
    if (!window.confirm(`Delete “${experiment.name}”? This also removes its events.`)) return;
    void run(async () => { await deleteExperiment(experiment.id); onDeleted(); }, "Experiment deleted.");
  }

  function removeEvent(item: ExperimentEvent) {
    if (!window.confirm(`Delete the ${item.event_type} event?`)) return;
    void run(() => deleteExperimentEvent(experiment.id, item.id), "Event deleted.");
  }

  return <section className="panel management-panel" aria-labelledby="manage-heading">
    <div className="section-heading"><div><p className="eyebrow">Manage</p><h2 id="manage-heading">Experiment actions</h2></div></div>
    <div className="action-row">
      <button type="button" onClick={() => setMetadataOpen(!metadataOpen)}>Edit details</button>
      {!experiment.started_at && <button type="button" onClick={() => setTimeAction("started_at")}>Start experiment</button>}
      {experiment.started_at && !experiment.ended_at && <button type="button" onClick={() => setTimeAction("ended_at")}>End experiment</button>}
      <button type="button" className="danger-button" onClick={removeExperiment}>Delete experiment</button>
    </div>
    {metadataOpen && <form className="management-form" onSubmit={saveMetadata}>
      <label>Name<input name="name" required defaultValue={experiment.name} /></label>
      <label>Description<input name="description" defaultValue={experiment.description ?? ""} /></label>
      <label>Hypothesis<textarea name="hypothesis" defaultValue={experiment.hypothesis ?? ""} /></label>
      <button disabled={saving}>Save details</button>
    </form>}
    {timeAction === "started_at" && <form className="compact-form" onSubmit={(event) => saveTime("started_at", event)}><label>Actual start time<input name="started_at" type="datetime-local" required /></label><button disabled={saving}>Start experiment</button></form>}
    {timeAction === "ended_at" && <form className="compact-form" onSubmit={(event) => saveTime("ended_at", event)}><label>Actual end time<input name="ended_at" type="datetime-local" required /></label><button disabled={saving}>End experiment</button></form>}
    <div className="section-heading event-actions"><h3>Events</h3><button type="button" onClick={() => { setEditingEvent(null); setEventOpen(!eventOpen); }}>Add event</button></div>
    {eventOpen && <form className="management-form" onSubmit={saveEvent}>
      <label>Event type<input name="event_type" required defaultValue={editingEvent?.event_type ?? ""} /></label>
      <label>Description<input name="event_description" required defaultValue={editingEvent?.description ?? ""} /></label>
      <label>Occurred at<input name="occurred_at" type="datetime-local" required defaultValue={localDateTime(editingEvent?.occurred_at ?? null)} /></label>
      <button disabled={saving}>{editingEvent ? "Save event" : "Add event"}</button>
    </form>}
    <ul className="event-management-list">{experiment.events.map((item) => <li key={item.id}><span>{item.event_type}</span><button type="button" onClick={() => { setEditingEvent(item); setEventOpen(true); }}>Edit</button><button type="button" className="danger-button" onClick={() => removeEvent(item)}>Delete</button></li>)}</ul>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="form-success" role="status">{message}</p>}
  </section>;
}
