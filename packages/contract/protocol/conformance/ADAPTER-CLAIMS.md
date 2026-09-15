# ADAPTER-CLAIMS — the durability-claim declaration, and the lint that reads it

**What this file is.** CV-5's check. The rule says:

> No claim that a pause survives a process restart may rest on a runtime feature that is not published under the
> `latest` dist-tag with the provider pinned at build time; otherwise the Docket row alone is the durable state.

That is a statement about an adapter package's **documentation** and its **packaging**. No declarative fixture can
observe either — a fixture watches what code does, and this rule is about what a package says and what it depends on —
so CV-5's check is a lint over the package, [`lint/adapter-claims.mjs`](lint/adapter-claims.mjs), and this file is what
it reads and why.

**Why the rule exists.** A host framework that can pause a tool call and resume it later is the reason a host reaches
for one, and an adapter that surfaces a pending Docket entry through that mechanism is doing the right thing. The
danger is the sentence that follows: *and the pause survives a restart*. Where that is true only of a feature published
under a `beta` or a `next` tag, the adopter has been told their approval queue is durable on the strength of something
their package manager will not install. The Docket row is durable; a third-party pause on an unpublished tag is not,
and the difference is the whole of an audit record's value.

---

## 1. What an adapter package declares

In its `package.json`:

```jsonc
{
  "name": "@affiant/adapter-ai-sdk",
  "affiant": {
    "adapter": {
      "runtime": "ai",
      "surfaces": ["generateText", "streamText", "ToolLoopAgent"],
      "durabilityClaims": []
    }
  },
  "peerDependencies": { "ai": "^7.0.0" }
}
```

| Key | What it is |
|---|---|
| `runtime` | The npm package name of the framework this adapter is for. It **must** be one of the package's own `peerDependencies`: CV-5 is about a claim resting on a version the package pins at build time, and a runtime the package does not depend on pins nothing. |
| `surfaces` | The framework surfaces the adapter supports, by the framework's own names. At least one — an adapter that supports no surface is not an adapter. This is a published fact about the package, so a reader can see what it covers before installing it; the lint checks the shape and not the names, which only the framework can settle. |
| `durabilityClaims` | Every durability claim the package makes, each `{ feature, since }`: what the claim rests on, and the **runtime version the feature arrived in**. `feature` is not a free string — see §1.1. |

`"durabilityClaims": []` is a complete and ordinary declaration. It says the package claims no durability beyond the
Docket row — which is what AZ-5 says is true anyway — and it is what the first adapter declares.

### 1.1 The feature names a claim may use

A `feature` is one of two things and nothing else: one of the package's own declared `surfaces`, or one of the runtime
durability mechanisms below. A free string would make `feature` worthless — an author writes one claim, names it
anything, and every durability sentence in the README is backed by it — so the list is closed, and the lint reads it
out of this file, which is why it is data as well as prose.

- `durable-execution` — the runtime persists a suspended run and resumes it in a new process, so a pause outlives the
  process it began in.
- `approval-checkpoint` — the runtime persists a pending tool approval on its own side, rather than reconstructing it
  from a client's message history.
- `resumable-stream` — the runtime resumes a stream after a disconnect, so a call in flight is not lost with the
  connection.

A mechanism a runtime offers that this list does not name is added here, with a sentence, in the same pull request that
declares a claim on it. That is the point of the list: the vocabulary is reviewed once, in the open, rather than a
sentence at a time in a package nobody reads.

## 2. What the lint checks

```
node conformance/lint/adapter-claims.mjs <package directory>
node conformance/lint/adapter-claims.mjs <package directory> --offline
node conformance/lint/adapter-claims.mjs --self-test
```

**One: every declared claim, against the runtime's published `latest`.** For each `durabilityClaims` entry the lint
reads the runtime's dist-tags from the registry (`npm view <runtime> dist-tags --json`) and checks three things:

- `feature` is one of the names §1.1 allows — one of the package's own declared `surfaces`, or one of the runtime
  durability mechanisms. A free string is one claim that backs every sentence in the README.
- `since` is inside the package's own declared peer range. A claim resting on a version a host installing the package
  may not get is a claim the packaging does not support.
- `since` is at or below the runtime's `latest`. A claim resting on a feature only a `beta`, a `next` or a `canary` tag
  carries is exactly what CV-5 forbids, and the lint says which tag reaches how far.

The peer-range forms the lint reads are `^x.y.z`, `~x.y.z`, `>=x.y.z` and an exact `x.y.z`. A range it cannot read is a
**failure**, not a pass: a lint that shrugged at a range it did not understand would report "no problems" about a claim
it never checked.

**Two: the README, against the declared claims.** The lint reads the package's `README.md` sentence by sentence (§3) and
fails on any sentence that reads as a durability claim and names no declared `feature`.

**Exit codes.** `0` when every check passed, `1` when a check failed, and **`2` when the registry could not be
REACHED** — and only then. The third code is what lets an adapter package's continuous integration fall back to
`--offline` on a runner with no route to the registry without also swallowing the one failure that fallback cannot see:
a claim resting on a version `latest` has not reached is precisely what the registry half checks. It is a **network
class** and nothing else — `ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT` and their kin. A `404` or a `403` is the registry
*answering*: the declared runtime is named wrong, or nobody may read it, and either way the declaration is the defect,
so those exit `1` and no fallback hides them.

**`--offline`** skips the registry read, prints why, and runs everything that needs no network — the declaration's
shape, the feature names, the peer-range check and the whole README check. A run that used it has **not** verified any
declared claim against a published dist-tag, and it says so on the last line, so a result recorded from an offline run
is recorded honestly. Where a package declares no claims there is nothing the registry half could have checked, and the
two runs say the same thing.

**`--self-test`** runs the lint's own corpus in [`lint/adapter-claims.test/`](lint/adapter-claims.test/) — one directory
per case, each a `package.json`, a `README.md` and an `expected.json` saying what the lint must say about it — and the
registry classifier's cases beside it. It needs no network, and it is what this repository's CI runs on every push.
That is not decoration: `INVARIANTS.md` cites this script as CV-5's coverage, and the coverage lint accepts a `lint:`
citation only where a workflow actually invokes the script. A lint nobody runs checks nothing.

Every ruling that widened the detector is a case in that corpus, so a later narrowing that would let one of them back
through turns CI red rather than quietly reducing what CV-5 means.

## 3. How a sentence is read

A sentence is a **durability claim** when it carries a **durability word** and a **subject word** together, and it is
**backed** only when it also names a declared claim's `feature` verbatim.

| | |
|---|---|
| **Durability words** | `persist`·, `durable`, `durably`, `durability`, `survive`·, `checkpoint`·, `resume`·, `resumption`, `restore`·, `outlive`·, `preserved`, `restart`(s), `reboot`(s), `crash`(es), `failover`, `cold start`(s), `deploy`(s), `redeploy`(s) |
| **Subject words** | `pause`(d/s), `pending`, `entry` / `entries`, `approval`(s), `turn`(s), `call`(s), `work`, `row`(s) |
| **Denials and limits** | `no`, `not`, `never`, `cannot`, `can't`, `without`, `nothing`, `neither`, `nor`, `unsupported`, `rather than`, `instead of`, `would have to`, `does not`, `is not`, `are not`, `alone`, `only` |

A sentence carrying one of the third group **before** the durability word is discounted, and every discounted sentence
is printed with its line and the word that triggered it, so a reader checks the discount rather than taking it. Two
classes live in that group and both are needed. The **denials** are obvious: a README that states the rule says "no
claim that a pause survives a process restart may rest on …", which is CV-5 being quoted rather than promised. The
**limits**, `alone` and `only`, are the other half of the same rule — "the Docket row alone is the durable state" is
CV-5's own conclusion, and a lint that refused it would force every honest adapter to stop saying the one thing the
rule wants said.

**Why it is this blunt.** The first version of this lint matched affirmative phrases — "survives a restart", "is
durable" — and five of six ordinary sentences a real README would carry walked straight past it: *the pause is
persisted across deploys*, *a pending entry is checkpointed by the runtime*, *an approval outlives the process*,
*pending rows are preserved across redeploys*, *work resumes after a crash*. A second round found three more in plainer
English still: *work already approved is kept when the container is torn down*, *the pending entry is brought back when
the worker comes up again*, *your approval is still there waiting for you after a deploy*. A phrase list that has to
guess the shape of a sentence will always lose that race. This one asks a much blunter question and leans on `feature`
to keep it honest: **false positives are expected and acceptable**, because the cost of one is a sentence an author
rewords or a feature an author declares, and the cost of a miss is an adopter told their approval queue is durable on
the strength of a dist-tag nobody will install.

### What this lint is not

**It is a heuristic over prose, and it will miss things.** English has no closed vocabulary for durability, and a
sentence can always be written that means "this survives a restart" in words no list anticipated — *there is no
question that a pause outlasts the worker*, or a denial that is really a promise: *nothing a reviewer approved is lost
when the process is torn down*, which this lint discounts because `nothing` precedes the durability word. That case is
in the corpus, as a passing one, so the limit is written down rather than discovered.

The authority is therefore not the detector. It is **`durabilityClaims`** — what the package declares, checked against
the registry and the peer range, which is machine-readable and exact — and **CV-5's own text**, which binds whether or
not a lint noticed. A reviewer reads the README. What this lint does is catch the sentence written in good faith on a
Friday that nobody notices is a promise, and make the honest path the easy one: declare the feature, name it in the
sentence, and the lint agrees with you.

A sentence *could* also be written to slip through on purpose — "there is no question that a pause survives a process
restart" — and the answer to that is that it would be a false claim somebody put there deliberately, which is not what
a lint is for.

## 4. Where the result is recorded

The lint needs the registry, so it runs in the **adapter's own** continuous integration rather than in this repository,
and its result is published in the implementation's parity manifest: `adapters[].claimsLint`, `"pass"` or `"fail"`
([`PARITY.md`](PARITY.md)). A manifest that names an adapter and no `claimsLint` result is a manifest that has not
answered CV-5 for it.

This repository's own coverage lint ([`lint/lint.mjs`](lint/lint.mjs)) accepts CV-5's `lint:` citation as coverage,
which it does for no `suite:` and no `guard:` citation. The difference is that this script is **here**: it runs in this
repository's CI beside the coverage lint, against any package directory it is pointed at, and a reader can run it
themselves. The alternative would have been to exempt CV-5 for good and call that coverage.

## 5. The first adapter

`@affiant/adapter-ai-sdk` declares `runtime: "ai"`, the three surfaces it supports, and `durabilityClaims: []`. Its
README's CV-5 paragraph is the other half of the answer: it says that `WorkflowAgent` from `@ai-sdk/workflow` is not
supported, that the durability a workflow offers is the reason a host would reach for it, and that
`@ai-sdk/workflow`'s own `latest` release requires a peer range only a `beta` dist-tag satisfies — so until a run
proves otherwise, the Docket row alone is the durable state. Those sentences are the rule being stated, and the lint
discounts them as such by name and line; the empty `durabilityClaims` is the packaging half, and it has nothing for the
registry to refuse.

It is also the detector's first real test, and it was run as one: four sentences of that README trip the durability and
subject words, and all four are discounted with the word and the line printed. A detector that could not read the
honest README of the first adapter would be a detector nobody could adopt.
