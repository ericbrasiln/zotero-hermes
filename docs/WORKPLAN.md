# Zotero Hermes — Work Plan

> **Status:** planning baseline. This document is the implementation contract for the first development cycle.

## Goal

Build a Zotero 7+ plugin that audits a selected collection through Hermes, presents source-grounded metadata findings for human review, and later applies only approved changes locally.

## Non-goals for the first release

- automatic, unattended metadata changes;
- sending PDFs, notes, or attachments to Hermes;
- replacing Zotero's own citation and synchronization systems;
- supporting Zotero 6 in the first release;
- exposing the local Zotero database to the network;
- requiring users to store a Zotero Web API key in the plugin.

## Design decisions

1. The plugin is the local authority for reading and writing Zotero data.
2. Hermes is the analysis and source-retrieval layer.
3. The bridge returns JSON validated against a versioned schema.
4. The first release is read-only.
5. All writes require explicit user approval and a final diff review.
6. Local Hermes and remote Hermes use the same bridge contract.
7. Remote mode uses an outbound connection from the plugin. The local Zotero machine does not need an exposed inbound port.
8. A remote deployment should support Tailscale first and authenticated HTTPS as the public-network fallback.

## Phase 0 — project setup

- [ ] Confirm the public package name and Zotero plugin ID.
- [ ] Choose the official Zotero plugin template and verify its current Zotero compatibility.
- [ ] Create a separate Zotero test profile and synthetic test library.
- [ ] Define the LABHDUFBA visual identity, icon, and attribution text.
- [ ] Add CI for linting, unit tests, packaging, and a clean-build smoke test.

## Phase 1 — plugin shell

- [ ] Create the bootstrapped Zotero plugin manifest and lifecycle hooks.
- [ ] Add a menu item to the collection context menu: `Audit with Hermes`.
- [ ] Add a preferences pane with `Local Hermes` and `Remote Hermes` modes.
- [ ] Add bridge URL, authentication token, request timeout, and privacy settings.
- [ ] Add a health-check action that reports bridge availability without sending library data.
- [ ] Remove all UI registrations and event listeners during plugin shutdown.

## Phase 2 — local collection reader

- [ ] Read the selected collection through Zotero's JavaScript API.
- [ ] Serialize only the fields required for the audit.
- [ ] Include stable Zotero item keys so findings can be mapped back locally.
- [ ] Exclude attachments, notes, and child items from the first audit payload.
- [ ] Add a payload size limit and a visible item count before submission.
- [ ] Test collections containing empty fields, accents, multiple creators, and duplicate titles.

## Phase 3 — bridge contract

- [ ] Define `POST /v1/audits` for collection audit requests.
- [ ] Define `GET /v1/health` for connectivity checks.
- [ ] Version the request and response schemas.
- [ ] Require a per-installation bearer token.
- [ ] Bind local mode to loopback only.
- [ ] Document remote mode with Tailscale and authenticated HTTPS.
- [ ] Return structured errors for authentication, payload validation, timeout, and upstream failures.

### Request shape

```json
{
  "schemaVersion": "1.0",
  "operation": "audit_collection",
  "collection": { "key": "...", "name": "..." },
  "items": [
    {
      "key": "...",
      "itemType": "book",
      "title": "...",
      "creators": [],
      "date": "...",
      "publisher": "...",
      "place": "...",
      "ISBN": "...",
      "language": "...",
      "tags": []
    }
  ],
  "options": {
    "checkMissingFields": true,
    "checkISBN": true,
    "checkNamesAndTitles": true,
    "checkDuplicates": true,
    "checkLanguages": true
  }
}
```

### Finding shape

```json
{
  "schemaVersion": "1.0",
  "collectionKey": "...",
  "findings": [
    {
      "itemKey": "...",
      "field": "creators",
      "current": [],
      "proposed": [],
      "kind": "inconsistent_creator",
      "confidence": "high",
      "reason": "...",
      "sources": [{ "title": "...", "url": "..." }],
      "action": "review"
    }
  ]
}
```

## Phase 4 — Hermes auditing service

- [ ] Extract the reusable audit logic from the current `zotero-personal-api` skill workflow.
- [ ] Add structured-output instructions for the Hermes bridge.
- [ ] Keep source retrieval separate from final proposal generation.
- [ ] Require a source or an explicit `unverified` reason for every proposed correction.
- [ ] Preserve uncertainty for edition-specific ISBNs, dates, publishers, and places.
- [ ] Add deterministic checks before using an LLM: missing fields, ISBN checksum, duplicate titles, and language gaps.
- [ ] Add an audit mode that never calls a write tool.

## Phase 5 — review interface

- [ ] Display a collection summary before audit submission.
- [ ] Show findings grouped by item and by problem type.
- [ ] Show current value, proposed value, confidence, reason, and sources.
- [ ] Add accept, reject, and edit actions.
- [ ] Add filters for high-confidence findings and missing fields.
- [ ] Export the report as JSON and HTML.
- [ ] Make no Zotero changes in this phase.

## Phase 6 — controlled writes

- [ ] Add a final review dialog listing every selected change.
- [ ] Re-read the affected Zotero items immediately before writing.
- [ ] Abort if an item changed since the audit request.
- [ ] Apply approved changes inside a Zotero transaction.
- [ ] Store a local audit log with timestamp, item key, old value, new value, source, and user decision.
- [ ] Provide an undo or restoration workflow based on the audit log.
- [ ] Re-read every changed item and verify the exact final values.

## Phase 7 — export and release quality

- [ ] Export the selected collection as BibTeX using Zotero's native exporter.
- [ ] Offer HTML, Markdown, CSV, and TXT derived from the same selected item set.
- [ ] Test pagination and duplicate citation keys.
- [ ] Add accessibility checks for the review interface.
- [ ] Add privacy documentation and a data-flow diagram.
- [ ] Add a reproducible package build.
- [ ] Test installation and uninstall in a clean Zotero profile.
- [ ] Prepare screenshots, documentation, and a support policy.
- [ ] Submit the plugin for review on the Zotero plugins page after a stable release.

## Acceptance criteria for the first public alpha

- The plugin installs in a clean Zotero 7+ profile.
- The user can configure local or remote Hermes.
- The plugin can audit a collection without modifying it.
- The bridge rejects malformed or unauthenticated requests.
- The report identifies missing fields, ISBN issues, duplicate titles, inconsistent names/titles, and missing languages.
- Every proposed external correction contains a source or an explicit uncertainty explanation.
- The plugin never writes without explicit user approval.
- Tests cover empty fields, multiple creators, accents, duplicate titles, network failure, timeout, and stale-item detection.
- The repository contains build instructions, privacy documentation, a license, and a reproducible release artifact.

## Open decisions

- Final repository/package name: `zotero-hermes` is the current working name.
- Whether the first public release should include write-back or remain read-only.
- Whether the remote bridge should be part of this repository or a separate Hermes service repository.
- Which model/provider is recommended for the default Hermes deployment.
- Whether users may bring their own external search/API credentials.
- Whether the plugin should support collection export independently of Hermes.

## Verification commands planned for implementation

```bash
npm test
npm run lint
npm run build
npm run package
```

The exact commands will follow the selected Zotero plugin template.
