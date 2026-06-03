// Humanizer — single-file React component.
// MIT licensed. Voice profiles in /profiles/ are CC-BY-SA 4.0.
//
// Purpose: take AI-smoothed prose and *restore* authorial voice using a voice profile
// as the model's anchor. Tracks what was preserved (voice signatures) and what was
// reversed (AI smoothing patterns) so the model has feedback to learn from.
//
// This is a salvaged v2 component, sanitised for public release. The Anthropic API
// call is made directly from the browser; ship behind your own backend for any
// production use that exposes a key to the client.
//
// Drop this file into a Vite + React + Tailwind project. Place the /profiles directory
// at your public root (e.g. `public/profiles`) and the /assets directory likewise.

import React, { useEffect, useMemo, useRef, useState } from "react";

// ----------------------------- constants -----------------------------------

const MODEL = "claude-sonnet-4-5";          // change to whatever you have access to
const API_VERSION = "2023-06-01";

// Resolve URLs relative to the Vite base path so the same component works
// at the repo root in dev and under a /humanizer/ subpath on GitHub Pages.
const BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/";
const PROFILES_INDEX = BASE + "profiles/index.json";
const MARK_SRC = BASE + "assets/mark.webp";
const MARK_FALLBACK = BASE + "assets/mark.png";

const MODES = {
  professional: {
    label: "Professional",
    description:
      "Keep the voice. Soften coinages, idiosyncratic punctuation, and chat-register markers.",
  },
  "all-inclusive": {
    label: "All-Inclusive",
    description:
      "Preserve everything the profile flags as signal, including informal markers.",
  },
};

// ----------------------------- helpers -------------------------------------

function splitSentences(text) {
  if (!text) return [];
  // Pragmatic split: keep the terminator, handle quotes loosely.
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z"'\(‘“\d])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordCount(s) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function sentenceLengths(text) {
  return splitSentences(text).map(wordCount);
}

// Pattern catalogue used for the pre-humanize smoothing scan. Profiles can extend
// this list via their own "smoothing patterns" section, but these are the cross-cutting
// ones AI editors reach for regardless of target voice.
const SMOOTHING_PATTERNS = [
  { id: "moreover",        rx: /\b(moreover|furthermore|additionally|in addition)\b/gi, note: "additive padding" },
  { id: "in-conclusion",   rx: /\b(in conclusion|in summary|to summarize|to sum up)\b/gi, note: "wrap-up boilerplate" },
  { id: "it-is-important", rx: /\bit (is|should be) (important|noted|noted that|emphasized)\b/gi, note: "throat-clear" },
  { id: "going-forward",   rx: /\b(going forward|moving forward|at the end of the day)\b/gi, note: "corporate filler" },
  { id: "leverage",        rx: /\b(leverage|utilize|facilitate|optimize|robust|holistic|synergy|seamless|scalable|empower|unlock)\b/gi, note: "consultantese" },
  { id: "i-hope-this",     rx: /\bi hope this (email|message) finds you well\b/gi, note: "rote opener" },
  { id: "please-be",       rx: /\b(please be advised|please be informed|kindly find attached|per (our|my) (last )?(email|discussion))\b/gi, note: "stiff frame" },
  { id: "hedge-stack",     rx: /\b(it (seems|appears) that perhaps|we may want to consider possibly)\b/gi, note: "hedge stack" },
  { id: "delve",           rx: /\b(delve into|dive deep|navigate the complexit\w+|harness the power of|in (today'?s|the) (rapidly evolving|fast-paced) (landscape|world))\b/gi, note: "AI giveaway phrasing" },
  { id: "passive-decision",rx: /\b(a decision was made|it was decided|it has been determined)\b/gi, note: "agentless passive" },
];

function scanSmoothing(text) {
  const hits = [];
  for (const p of SMOOTHING_PATTERNS) {
    let m;
    p.rx.lastIndex = 0;
    while ((m = p.rx.exec(text)) !== null) {
      hits.push({ id: p.id, note: p.note, match: m[0], index: m.index });
      if (m.index === p.rx.lastIndex) p.rx.lastIndex++;
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

// Persisted learning store. localStorage in the browser, namespaced.
const STORE_KEY = "humanizer.decisions.v1";
function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); }
  catch { return {}; }
}
function saveStore(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {}
}
function recordDecision({ profileId, mode, kind, before, after, note }) {
  const s = loadStore();
  const k = `${profileId}::${mode}`;
  s[k] = s[k] || [];
  s[k].push({ kind, before, after, note, ts: Date.now() });
  // Cap per-profile history so localStorage doesn't blow up.
  if (s[k].length > 200) s[k] = s[k].slice(-200);
  saveStore(s);
}

// ----------------------------- API call ------------------------------------

async function humanize({ apiKey, profileMd, mode, input }) {
  const system = buildSystemPrompt({ profileMd, mode });
  const body = {
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [
      {
        role: "user",
        content:
          "Restore the voice in the following text using the profile. Return JSON with keys " +
          "`output` (the restored text), `preserved` (array of signature names you kept), and " +
          "`reversed` (array of smoothing patterns you undid). No prose outside the JSON.\n\n" +
          "TEXT:\n" + input,
      },
    ],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text ?? "";
  return parseModelJson(text);
}

function buildSystemPrompt({ profileMd, mode }) {
  return `You are a voice-restoration editor. Your job is to take AI-smoothed prose
and rewrite it in the voice described by the profile below. You are not editing for
grammar or clarity unless those are explicitly part of the profile. You are restoring
signal that automated smoothing has removed.

MODE: ${mode}
- "professional": preserve voice signatures the profile lists as PRESERVE, but soften
  the most informal markers (chat-register particles, lowercase salutations to senior
  recipients, emoji clusters) where the profile flags them as register-conditional.
- "all-inclusive": preserve every PRESERVE signature, including informal markers.

RULES
1. Do not invent content. If a fact is not in the input, do not add it.
2. Do not flatten variation in sentence length. Restore short-followed-by-long rhythm.
3. Reverse each smoothing pattern the profile names. Track which ones you reversed.
4. Track which voice signatures from the profile you actively preserved.
5. Return ONLY a JSON object. No commentary.

VOICE PROFILE
-----
${profileMd}
-----`;
}

function parseModelJson(text) {
  // Defensive: strip code fences if the model added them.
  const stripped = text.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try {
    const j = JSON.parse(stripped);
    return {
      output: j.output ?? "",
      preserved: Array.isArray(j.preserved) ? j.preserved : [],
      reversed: Array.isArray(j.reversed) ? j.reversed : [],
    };
  } catch {
    // Fall back to treating the whole response as the output.
    return { output: text, preserved: [], reversed: [] };
  }
}

// ----------------------------- sparkline -----------------------------------

function Sparkline({ values, max, label }) {
  const W = 220, H = 36, P = 2;
  const m = Math.max(max || 1, ...values, 1);
  const step = values.length > 1 ? (W - 2 * P) / (values.length - 1) : 0;
  const pts = values.map((v, i) => {
    const x = P + i * step;
    const y = H - P - (v / m) * (H - 2 * P);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500">
      <span className="w-12 shrink-0">{label}</span>
      <svg width={W} height={H} className="overflow-visible">
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          points={pts.join(" ")}
        />
        {values.map((v, i) => (
          <circle
            key={i}
            cx={P + i * step}
            cy={H - P - (v / m) * (H - 2 * P)}
            r="1.6"
            fill="currentColor"
          />
        ))}
      </svg>
      <span className="tabular-nums">
        n={values.length} · μ={values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0}
      </span>
    </div>
  );
}

// ----------------------------- brand mark ----------------------------------

function BrandMark() {
  const [failed, setFailed] = useState(false);
  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-10 opacity-60 hover:opacity-90 transition-opacity">
      <img
        src={failed ? MARK_FALLBACK : MARK_SRC}
        onError={() => setFailed(true)}
        alt=""
        aria-hidden="true"
        width={48}
        height={61}
        style={{ display: "block" }}
      />
    </div>
  );
}

// ----------------------------- main --------------------------------------

export default function Humanizer() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("humanizer.apiKey") || "");
  const [profileList, setProfileList] = useState([]);
  const [profileId, setProfileId] = useState(null);
  const [profileMd, setProfileMd] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);
  const [mode, setMode] = useState("professional");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [preserved, setPreserved] = useState([]);
  const [reversed, setReversed] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Load profile index on mount.
  useEffect(() => {
    fetch(PROFILES_INDEX)
      .then((r) => r.json())
      .then((j) => {
        setProfileList(j.profiles || []);
        const first = j.profiles?.find((p) => p.id !== "_template") || j.profiles?.[0];
        if (first) setProfileId(first.id);
      })
      .catch((e) => setErr(`Could not load profile index: ${e.message}`));
  }, []);

  // Load selected profile.
  useEffect(() => {
    if (!profileId) return;
    const p = profileList.find((p) => p.id === profileId);
    if (!p) return;
    // Allow user edits in localStorage to override the on-disk version.
    const overrideKey = `humanizer.profile.${profileId}`;
    const override = localStorage.getItem(overrideKey);
    if (override) {
      setProfileMd(override);
      return;
    }
    fetch(`${BASE}profiles/${p.file}`)
      .then((r) => r.text())
      .then(setProfileMd)
      .catch((e) => setErr(`Could not load profile: ${e.message}`));
  }, [profileId, profileList]);

  // Persist API key locally (browser only). Document in README that this is a salvaged
  // pattern, not a production one.
  useEffect(() => {
    if (apiKey) localStorage.setItem("humanizer.apiKey", apiKey);
  }, [apiKey]);

  const inLens = useMemo(() => sentenceLengths(input), [input]);
  const outLens = useMemo(() => sentenceLengths(output), [output]);
  const smoothingHits = useMemo(() => scanSmoothing(input), [input]);

  const onRun = async () => {
    if (!apiKey) { setErr("Add an Anthropic API key first."); return; }
    if (!input.trim()) { setErr("Paste some text to restore."); return; }
    if (!profileMd) { setErr("Pick a voice profile first."); return; }
    setErr(""); setBusy(true); setOutput(""); setPreserved([]); setReversed([]);
    try {
      const r = await humanize({ apiKey, profileMd, mode, input });
      setOutput(r.output);
      setPreserved(r.preserved);
      setReversed(r.reversed);
      recordDecision({
        profileId, mode, kind: "humanize",
        before: input.slice(0, 400), after: r.output.slice(0, 400),
        note: { preserved: r.preserved, reversed: r.reversed },
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onReject = () => {
    recordDecision({
      profileId, mode, kind: "reject",
      before: input.slice(0, 400), after: output.slice(0, 400),
      note: { preserved, reversed },
    });
    setOutput("");
    setPreserved([]);
    setReversed([]);
  };

  const onSaveProfile = () => {
    if (!profileId) return;
    localStorage.setItem(`humanizer.profile.${profileId}`, profileMd);
    setProfileEditing(false);
  };

  const onResetProfile = () => {
    if (!profileId) return;
    localStorage.removeItem(`humanizer.profile.${profileId}`);
    // Trigger re-fetch.
    setProfileId((id) => id);
    const p = profileList.find((p) => p.id === profileId);
    if (p) fetch(`${BASE}profiles/${p.file}`).then((r) => r.text()).then(setProfileMd);
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <BrandMark />

      <header className="border-b border-neutral-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">Humanizer</h1>
            <span className="text-xs text-neutral-500">voice restoration · v0.1</span>
          </div>
          <div className="flex items-center gap-3">
            <select
              className="text-sm border border-neutral-300 rounded px-2 py-1 bg-white"
              value={profileId || ""}
              onChange={(e) => setProfileId(e.target.value)}
            >
              {profileList.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              className="text-sm px-3 py-1 rounded border border-neutral-300 hover:bg-neutral-100"
              onClick={() => setDrawerOpen(true)}
            >
              Profile
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-12 gap-6">
        {/* Left: input */}
        <section className="col-span-12 md:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700">Input</h2>
            <div className="flex items-center gap-2 text-xs">
              {Object.entries(MODES).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setMode(k)}
                  className={
                    "px-2 py-1 rounded border " +
                    (mode === k
                      ? "bg-neutral-900 text-white border-neutral-900"
                      : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100")
                  }
                  title={v.description}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            className="w-full h-72 p-3 border border-neutral-300 rounded text-sm font-mono leading-relaxed bg-white"
            placeholder="Paste AI-edited text here."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <Sparkline values={inLens} max={Math.max(...inLens, ...outLens, 1)} label="rhythm" />
          {smoothingHits.length > 0 && (
            <details className="text-xs bg-amber-50 border border-amber-200 rounded p-2">
              <summary className="cursor-pointer text-amber-900">
                Detected {smoothingHits.length} smoothing pattern{smoothingHits.length > 1 ? "s" : ""} in input
              </summary>
              <ul className="mt-2 space-y-1">
                {smoothingHits.slice(0, 20).map((h, i) => (
                  <li key={i} className="text-amber-900">
                    <code className="bg-amber-100 px-1 rounded">{h.match}</code>
                    <span className="text-amber-700"> — {h.note}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex items-center gap-2 pt-2">
            <input
              type="password"
              placeholder="Anthropic API key (sk-ant-…)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="flex-1 text-xs px-2 py-1 border border-neutral-300 rounded font-mono"
            />
            <button
              onClick={onRun}
              disabled={busy}
              className="px-4 py-1.5 text-sm rounded bg-neutral-900 text-white hover:bg-neutral-800 disabled:bg-neutral-400"
            >
              {busy ? "Restoring…" : "Humanize"}
            </button>
          </div>
          {err && <div className="text-xs text-red-700">{err}</div>}
        </section>

        {/* Right: output */}
        <section className="col-span-12 md:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700">Output</h2>
            {output && (
              <div className="flex items-center gap-2 text-xs">
                <button
                  className="px-2 py-1 rounded border border-neutral-300 hover:bg-neutral-100"
                  onClick={() => navigator.clipboard.writeText(output)}
                >
                  Copy
                </button>
                <button
                  className="px-2 py-1 rounded border border-neutral-300 hover:bg-neutral-100"
                  onClick={onReject}
                  title="Tell the learning store this output missed the mark"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
          <div className="w-full h-72 p-3 border border-neutral-300 rounded text-sm font-mono leading-relaxed bg-white whitespace-pre-wrap overflow-y-auto">
            {output || <span className="text-neutral-400">Output will appear here.</span>}
          </div>
          <Sparkline values={outLens} max={Math.max(...inLens, ...outLens, 1)} label="rhythm" />
          {(preserved.length > 0 || reversed.length > 0) && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-emerald-50 border border-emerald-200 rounded p-2">
                <div className="font-medium text-emerald-900 mb-1">Preserved</div>
                <ul className="space-y-0.5 text-emerald-900">
                  {preserved.map((p, i) => <li key={i}>· {p}</li>)}
                </ul>
              </div>
              <div className="bg-sky-50 border border-sky-200 rounded p-2">
                <div className="font-medium text-sky-900 mb-1">Reversed</div>
                <ul className="space-y-0.5 text-sky-900">
                  {reversed.map((p, i) => <li key={i}>· {p}</li>)}
                </ul>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Profile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-20 flex">
          <div className="flex-1 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <aside className="w-full max-w-2xl bg-white shadow-xl flex flex-col">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Voice profile</div>
                <div className="text-xs text-neutral-500">
                  {profileList.find((p) => p.id === profileId)?.name}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {profileEditing ? (
                  <>
                    <button className="px-2 py-1 rounded border border-neutral-300" onClick={onResetProfile}>Reset to default</button>
                    <button className="px-2 py-1 rounded bg-neutral-900 text-white" onClick={onSaveProfile}>Save</button>
                  </>
                ) : (
                  <button className="px-2 py-1 rounded border border-neutral-300" onClick={() => setProfileEditing(true)}>Edit</button>
                )}
                <button className="px-2 py-1 rounded border border-neutral-300" onClick={() => setDrawerOpen(false)}>Close</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {profileEditing ? (
                <textarea
                  className="w-full h-full min-h-[60vh] p-3 border border-neutral-300 rounded text-xs font-mono leading-relaxed"
                  value={profileMd}
                  onChange={(e) => setProfileMd(e.target.value)}
                />
              ) : (
                <pre className="text-xs whitespace-pre-wrap leading-relaxed text-neutral-800">{profileMd}</pre>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
