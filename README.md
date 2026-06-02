# Humanizer

**A framework for restoring authorial voice in AI-edited writing.**

Humanizer is not an AI grammar checker. It is the opposite of one. Most "rewrite this"
tools pull text *toward* a flat, register-neutral mean. Humanizer pulls it *back* —
toward a voice described by a profile of features the writer has actively chosen.

It does this with three pieces:

1. A **voice profile** — a plain-Markdown document that names the signatures a writer
   wants preserved, the AI-smoothing patterns they want reversed, the sentence rhythm
   they aim for, and the cited linguistics behind those choices.
2. A **smoothing detector** — a pattern catalogue that scans incoming text for the
   tell-tale marks of automated editing (additive padding, hedge stacks, agentless
   passives, consultantese, the *delve/leverage/seamless* layer).
3. A **single-file React component** (`humanizer.jsx`) that loads a profile, calls a
   language model with the profile as system anchor, and shows you what was preserved
   and what was reversed — with a sentence-length sparkline for each side so you can
   *see* the rhythm change.

This repo ships with **three example profiles and a blank template**. The examples are
not products. They are demonstrations of how to write a profile with cited research
behind it.

---

## Why this exists

AI editors are now in the default path of almost every professional writing tool. Their
default behaviour is to *smooth* — to remove the marks of an author's hand. Most of those
marks are not errors. They are voice. They are the difference between a sentence written
by someone and a sentence written by no one.

A "humanizer" that just adds typos or contractions doesn't fix this. The flatness isn't
in the punctuation — it's in the structural choices: nominalisation, hedge stacking,
agentless passive, equal-length sentences, the four-bar rhythm of a list expanded to look
thorough.

This project is a working hypothesis that the right way to defend voice against AI
smoothing is to **describe the voice explicitly**, in a document a language model can
read, with the actual linguistic features named, and then ask the model to *restore*
what was removed rather than rewrite from scratch.

---

## Repo contents

```
humanizer.jsx              # single-file React component (MIT)
profiles/
  index.json               # manifest the UI reads
  _template.md             # blank profile, copy this to author your own
  southeast-asian-english.md   # working profile, CC-BY-SA 4.0
  american-business-english.md # working profile, CC-BY-SA 4.0
  gen-z-formal.md              # working profile, CC-BY-SA 4.0
assets/
  mark.webp                # animated brand mark (transparent)
  mark.png                 # static fallback
LICENSE                    # MIT, covers code
LICENSE-profiles           # CC-BY-SA 4.0, covers profiles/*.md
```

---

## Getting started

This is a single React file. The fastest way to run it locally:

```bash
# 1. Scaffold a Vite + React + Tailwind project (or use your own).
npm create vite@latest humanizer-app -- --template react
cd humanizer-app
npm i
npm i -D tailwindcss postcss autoprefixer && npx tailwindcss init -p
# (configure Tailwind per its docs)

# 2. Drop the files in.
cp ../humanizer/humanizer.jsx src/Humanizer.jsx
cp -r ../humanizer/profiles public/profiles
cp -r ../humanizer/assets   public/assets

# 3. Mount it in src/App.jsx:
#    import Humanizer from "./Humanizer.jsx"
#    export default function App(){ return <Humanizer /> }

npm run dev
```

When the app loads, paste an Anthropic API key into the field at the bottom of the input
column. The key is stored in `localStorage` only — it never leaves your browser except
in the direct request to `api.anthropic.com`. **For any production deployment, replace
the in-browser API call with a backend proxy.** The salvaged in-browser call is fine for
solo use and demos; it is not fine for anything multi-user.

---

## Writing your own profile

Copy `profiles/_template.md` to a new file (e.g. `profiles/my-voice.md`), add it to
`profiles/index.json`, and edit. The profile fields in order:

1. **Identity** — who this profile is for, and what it does not claim to describe.
2. **Disclaimer** — a starting point, not a definitive cultural description.
3. **Voice signatures (PRESERVE)** — concrete features the model should treat as signal.
4. **AI-smoothing patterns (REVERSE)** — what to undo, with before/after examples.
5. **Sentence rhythm** — typical length distribution, characteristic variation.
6. **Lexical preferences** — words to prefer, words to avoid when smoothing imposed them.
7. **Discourse markers** — connectives, particles, tone signals.
8. **Punctuation and orthography** — load-bearing typographic conventions.
9. **What this profile is NOT** — explicit out-of-scope statement.
10. **Sample restoration** — a before/after paragraph pair.
11. **Annotated bibliography** — every claim should be defensible from this list.

The example profiles all follow this structure. They are themselves derived from
published linguistics work; if you fork one, keep the citations.

---

## On the example profiles

The three working profiles are **starting points**, not finished products, and not
descriptions of any one person. Each one is grounded in cited linguistic research:

- **Southeast Asian English** draws on Kachru's three-circles framework, Schneider's
  postcolonial Englishes model, Platt/Weber/Ho's descriptions of the "New Englishes",
  Leimgruber and Wee on Colloquial Singapore English, Watkins on Burmese.
- **American Business English (Plain-Language Tradition)** draws on Williams, Garner,
  Kimble, the Plain Writing Act, Biber's corpus work on register, and the
  Hemingway/Kansas-City-Star inheritance.
- **Gen-Z Formal Register** draws on McCulloch's *Because Internet*, the 2025 ZeroBounce
  workplace survey, British Council Gen-Z communication research, and Tagliamonte's
  adolescent-language work.

Full annotated bibliographies are inside each profile.

These are **not** statements about how members of any group "must" write. They are
descriptions of recurring features in the literature, which a humanising model can be
told to preserve where they appear. Communities whose voices these profiles attempt to
describe are explicitly invited to fork them.

---

## On the methodology

The original method was developed in private work where the author built a profile
against a large corpus of their own writing and used it to defend their voice from AI
flattening. That personal profile is **not** included in this repo. The structural
schema — *identity, signatures, smoothing patterns, rhythm, lexis, discourse, sample,
bibliography* — is what survives the move to public release.

Methodology credit: **Nae** (project author, 2024–2026). No personal corpus, samples, or
identifying voice features from that private work appear in this repo.

If you build a profile against your own corpus, the same caveats apply: keep your
samples private if you want, but ship the *schema* of what you found so other writers
can do the same work for their own voices.

---

## Licenses

- **Code** (`humanizer.jsx`, anything not in `profiles/`): MIT. See [LICENSE](LICENSE).
- **Voice profiles** (`profiles/*.md`): Creative Commons Attribution-ShareAlike 4.0.
  See [LICENSE-profiles](LICENSE-profiles).
- **Brand mark** (`assets/mark.*`): CC-BY-SA 4.0 alongside the profiles.

The profiles are CC-BY-SA on purpose. They describe communities of writers; if you
fork and improve them, the improvements should remain available to the same writers.

---

## Limitations and intended caveats

- **Voice profiles are not stereotypes.** They are *working hypotheses* about features
  worth preserving. Edit freely, especially if the profile attempts to describe your
  own voice and gets it wrong.
- **Citations are real, but not exhaustive.** Each profile lists 8–15 sources. There
  is more linguistics literature behind each topic than fits.
- **The smoothing detector is a heuristic.** It pattern-matches known AI tells; it does
  not understand context. A research paper that legitimately uses *moreover* will trip
  it. That's fine — the detector is a flag, not a judgment.
- **The in-browser API call is for solo use.** Use a backend proxy in production.
- **The model is doing the rewriting.** Profiles steer a generative model; they do not
  guarantee output. Inspect the diff. Reject when the model gets it wrong; the rejection
  is recorded locally and you can feed it back into a refined profile.

---

## Contributing

Pull requests welcome, especially:

- Improvements to the three example profiles from members of the communities they try
  to describe.
- New profiles with the same level of citation discipline.
- Smoothing patterns the current catalogue misses.
- A backend proxy reference implementation so the in-browser API call can be deprecated.

Open an issue first if you want to discuss scope. Please cite sources for any
linguistic claim added to a profile.

---

## Acknowledgements

The profile schema and the framing of "voice restoration as the inverse of smoothing"
were developed by Nae in private work in 2024–2026. The example profiles in this repo
were written from published linguistics research, not from any private corpus, and are
intended to be replaced or improved by the communities they reference.

Thanks to the linguistics literature this whole project rests on — Kachru, Schneider,
Platt, Leimgruber, Wee, Williams, Garner, Biber, McCulloch, and the many others cited
in the profile bibliographies.
