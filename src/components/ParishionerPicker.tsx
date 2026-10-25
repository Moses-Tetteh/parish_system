"use client";

import { useEffect, useRef, useState } from "react";

interface Hit { id: number; label: string; hint: string }

/** Type-ahead census search. Writes the chosen id to a hidden field named `name`; picking nothing leaves it empty. */
export function ParishionerPicker({ name, label, placeholder = "Search the parish list…", api = "/api/lookup/parishioner" }: { name: string; label: string; placeholder?: string; api?: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (picked || q.trim().length < 2) { setHits([]); return; }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${api}?q=${encodeURIComponent(q.trim())}`, { credentials: "same-origin" });
        if (r.ok && mine === seq.current) { setHits(await r.json()); setOpen(true); }
      } catch { /* offline: the user can still type a name instead */ }
    }, 250);
    return () => clearTimeout(t);
  }, [q, picked]);

  return (
    <div className="field full" style={{ position: "relative" }}>
      <label htmlFor={`${name}_q`}>{label}</label>
      <input type="hidden" name={name} value={picked?.id ?? ""} />
      <input id={`${name}_q`} type="text" autoComplete="off" value={picked ? picked.label : q} placeholder={placeholder} role="combobox" aria-expanded={open && hits.length > 0} aria-controls={`${name}_list`}
        onChange={(e) => { setPicked(null); setQ(e.target.value); }} onFocus={() => hits.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {picked && <button type="button" className="btn btn-small btn-secondary" style={{ marginTop: 4 }} onClick={() => { setPicked(null); setQ(""); }}>Clear</button>}
      {open && hits.length > 0 && (
        <ul id={`${name}_list`} role="listbox" className="plain-list" style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: "100%", background: "var(--white)", border: "1px solid var(--border)", borderRadius: 6, maxHeight: 220, overflow: "auto", margin: 0, padding: 0 }}>
          {hits.map((h) => (
            <li key={h.id} role="option" aria-selected={false} style={{ padding: "6px 10px", cursor: "pointer", listStyle: "none" }} onMouseDown={(e) => { e.preventDefault(); setPicked(h); setOpen(false); }}>
              {h.label} <span className="muted">{h.hint}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
