# Zotero Hermes

A Zotero plugin for collection auditing with [Hermes Agent](https://hermes-agent.nousresearch.com/docs/).

> **Status:** project planning. No installable plugin has been released yet.

Zotero Hermes will identify metadata problems in a Zotero collection and return source-grounded correction proposals for review. The user will approve changes before the plugin writes anything to the Zotero library.

The plugin will support two Hermes deployment modes:

- **Local Hermes:** the plugin connects to a Hermes bridge running on the same computer as Zotero.
- **Remote Hermes:** the plugin connects to a Hermes bridge running on a VPS, preferably over a private Tailscale network or authenticated HTTPS.

## Planned audit checks

- missing fields;
- suspicious or malformed ISBNs;
- inconsistent author names and titles;
- duplicate titles and probable duplicate records;
- missing languages;
- optional tag analysis.

## Planned workflow

1. Select a Zotero collection.
2. Choose **Audit with Hermes**.
3. Review the proposed findings, sources, confidence levels, and field diffs.
4. Accept or reject individual corrections.
5. Let the plugin write only the approved changes in a Zotero transaction.
6. Export the audit report when needed.

The first release will be read-only. Metadata writes will be added only after the audit report and approval flow are stable.

## Architecture

```text
Zotero plugin
  ├─ reads the selected collection through Zotero's local JavaScript API
  ├─ sends a minimal structured payload to a Hermes bridge
  ├─ displays structured findings and source links
  └─ writes approved changes locally in a transaction

Hermes bridge
  ├─ authenticates the plugin
  ├─ invokes the Zotero auditing skill
  ├─ performs external source lookups when necessary
  └─ returns schema-validated JSON; it never writes directly to Zotero
```

The plugin will not send Zotero API keys to Hermes. PDFs, notes, and attachments will not leave the local machine unless the user explicitly enables a future feature for them.

## Repository layout

```text
.
├── README.md
├── LICENSE
├── docs/
│   └── WORKPLAN.md
└── src/                 # planned Zotero plugin source
```

## Development prerequisites

The implementation target is Zotero 7+ and the current Zotero bootstrapped plugin model. The development setup will include:

- Zotero and a separate test profile;
- JavaScript/Node tooling used by the official Zotero plugin template;
- a local Hermes bridge for integration tests;
- a test Zotero library with synthetic records;
- automated tests for audit findings and write transactions.

No production Zotero library should be used for development tests.

## Project affiliation

This project is developed as an open-source product of the **LABHDUFBA — Laboratório de Humanidades Digitais da Universidade Federal da Bahia**.

The initial project name is **Zotero Hermes**. The final package ID, icon, visual identity, and public description will be defined before the first release.

## License

MIT. See [LICENSE](LICENSE).

## Contributing

Contribution guidelines will be added before the first public development release. Until then, design decisions and implementation scope are tracked in [docs/WORKPLAN.md](docs/WORKPLAN.md).
