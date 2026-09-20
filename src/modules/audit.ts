import { getPref, setPref } from "../utils/prefs";

export interface AuditItemPayload {
  key: string;
  itemType: string;
  title: string;
  creators: Array<Record<string, string>>;
  date: string;
  publisher: string;
  place: string;
  ISBN: string;
  language: string;
  tags: string[];
}

export interface AuditRequest {
  schemaVersion: "1.0";
  operation: "audit_collection";
  collection: { key: string; name: string };
  items: AuditItemPayload[];
  options: {
    checkMissingFields: boolean;
    checkISBN: boolean;
    checkNamesAndTitles: boolean;
    checkDuplicates: boolean;
    checkLanguages: boolean;
  };
}

export interface AuditFinding {
  itemKey: string;
  field: string;
  current: unknown;
  proposed: unknown;
  kind: string;
  confidence: string;
  reason: string;
  sources: string[];
  action: string;
}

export interface AuditResult {
  schemaVersion: string;
  collectionKey: string;
  findings: AuditFinding[];
}

interface ReviewDecision {
  itemKey: string;
  field: string;
  decision: "approved" | "rejected";
  proposed: string;
  timestamp: string;
}

const reviewSession = new Map<string, ReviewDecision>();

function getSelectedCollection(): any | null {
  const pane = ztoolkit.getGlobal("ZoteroPane") as any;
  if (typeof pane.getSelectedCollection !== "function") return null;
  return pane.getSelectedCollection() ?? null;
}

function serializeItem(item: any): AuditItemPayload {
  const creators =
    typeof item.getCreators === "function" ? item.getCreators() : [];
  const tags = typeof item.getTags === "function" ? item.getTags() : [];
  const field = (name: string) => String(item.getField?.(name) ?? "");
  return {
    key: String(item.key),
    itemType: String(item.itemType),
    title: field("title"),
    creators: creators.map((creator: any) => ({
      creatorType: String(creator.creatorType ?? "author"),
      firstName: String(creator.firstName ?? ""),
      lastName: String(creator.lastName ?? ""),
      name: String(creator.name ?? ""),
    })),
    date: field("date"),
    publisher: field("publisher"),
    place: field("place"),
    ISBN: field("ISBN"),
    language: field("language"),
    tags: tags.map((tag: any) => String(tag.tag ?? "")),
  };
}

export async function buildAuditRequest(): Promise<AuditRequest | null> {
  const collection = getSelectedCollection();
  if (!collection) return null;
  const childItems = await Promise.resolve(collection.getChildItems?.() ?? []);
  const items = childItems
    .filter(
      (item: any) =>
        item &&
        typeof item.isRegularItem === "function" &&
        item.isRegularItem(),
    )
    .map(serializeItem);
  return {
    schemaVersion: "1.0",
    operation: "audit_collection",
    collection: { key: String(collection.key), name: String(collection.name) },
    items,
    options: {
      checkMissingFields: true,
      checkISBN: true,
      checkNamesAndTitles: true,
      checkDuplicates: true,
      checkLanguages: true,
    },
  };
}

function escapeHTML(value: string): string {
  return value.replace(/[&<>]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "vazio";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function findingText(finding: AuditFinding): string {
  const current = `atual: ${valueText(finding.current)}`;
  const proposed =
    finding.proposed === null || finding.proposed === undefined
      ? " · proposta: nenhuma"
      : ` · proposta: ${valueText(finding.proposed)}`;
  const sources = finding.sources.length
    ? ` · fontes: ${finding.sources.join(", ")}`
    : "";
  return escapeHTML(
    `[${finding.itemKey}] ${finding.field} · ${current}${proposed} · confiança: ${finding.confidence} · ${finding.reason}${sources}`,
  );
}

const WRITABLE_FIELDS = new Set([
  "title",
  "date",
  "publisher",
  "place",
  "ISBN",
  "language",
  "abstractNote",
  "url",
  "DOI",
  "volume",
  "issue",
  "pages",
  "series",
  "seriesNumber",
  "archive",
  "archiveLocation",
  "callNumber",
  "creators",
  "tags",
]);

interface ChangeLogEntry {
  batchID: string;
  timestamp: string;
  libraryID: number;
  itemKey: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  decision: "approved";
  confidence: string;
  sources: string[];
}

function structuredValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function creatorValue(item: any): any[] {
  return (item.getCreators?.() ?? []).map((creator: any) => ({
    creatorType: String(creator.creatorType ?? "author"),
    firstName: String(creator.firstName ?? ""),
    lastName: String(creator.lastName ?? ""),
    name: String(creator.name ?? ""),
  }));
}

function tagValue(item: any): string[] {
  return (item.getTags?.() ?? []).map((tag: any) => String(tag.tag ?? tag));
}

function itemValue(item: any, field: string): unknown {
  if (field === "creators") return creatorValue(item);
  if (field === "tags") return tagValue(item);
  return String(item.getField(field) ?? "");
}

function canonicalStructured(field: string, value: unknown): string {
  const parsed = structuredValue(value);
  if (field === "tags" && Array.isArray(parsed)) {
    return JSON.stringify(parsed.map((tag) => String(tag)).sort());
  }
  if (field === "creators" && Array.isArray(parsed)) {
    return JSON.stringify(
      parsed.map((creator: any) => ({
        creatorType: String(creator?.creatorType ?? "author"),
        firstName: String(creator?.firstName ?? ""),
        lastName: String(creator?.lastName ?? ""),
        name: String(creator?.name ?? ""),
      })),
    );
  }
  return JSON.stringify(parsed ?? null);
}

function valuesEqual(
  field: string,
  actual: unknown,
  expected: unknown,
): boolean {
  if (field === "creators" || field === "tags") {
    return (
      canonicalStructured(field, actual) ===
      canonicalStructured(field, expected)
    );
  }
  return String(actual ?? "") === String(expected ?? "");
}

function setItemValue(item: any, field: string, value: unknown): void {
  if (field === "creators") {
    const creators = structuredValue(value);
    if (!Array.isArray(creators))
      throw new Error("A proposta de creators não é uma lista JSON válida.");
    item.setCreators(creators);
    return;
  }
  if (field === "tags") {
    const tags = structuredValue(value);
    if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) {
      throw new Error("A proposta de tags deve ser uma lista JSON de textos.");
    }
    item.setTags(tags);
    return;
  }
  item.setField(field, String(value ?? ""));
}

function readChangeLog(): ChangeLogEntry[] {
  try {
    const parsed = JSON.parse(String(getPref("review-log") || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeChangeLog(entries: ChangeLogEntry[]): void {
  setPref("review-log", JSON.stringify(entries.slice(-500)));
}

async function applyApprovedChanges(
  request: AuditRequest,
  findings: AuditFinding[],
  proposedValues: string[],
): Promise<void> {
  const collection = getSelectedCollection();
  if (!collection || String(collection.key) !== request.collection.key) {
    throw new Error(
      "A coleção selecionada mudou desde a auditoria. A operação foi abortada.",
    );
  }
  const changes = findings.map((finding, index) => {
    if (!WRITABLE_FIELDS.has(finding.field)) {
      throw new Error(`O campo ${finding.field} não é gravável nesta versão.`);
    }
    const item = (Zotero as any).Items.getByLibraryAndKey(
      collection.libraryID,
      finding.itemKey,
    );
    if (!item) throw new Error(`Item ${finding.itemKey} não foi encontrado.`);
    const current = itemValue(item, finding.field);
    if (!valuesEqual(finding.field, current, finding.current)) {
      throw new Error(
        `O item ${finding.itemKey}, campo ${finding.field}, mudou desde a auditoria. A operação foi abortada.`,
      );
    }
    const proposed = structuredValue(proposedValues[index]);
    return { finding, item, field: finding.field, current, proposed };
  });
  const batchID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const timestamp = new Date().toISOString();
  await (Zotero as any).DB.executeTransaction(async () => {
    for (const change of changes) {
      setItemValue(change.item, change.field, change.proposed);
      await change.item.save();
    }
  });
  for (const change of changes) {
    const finalValue = itemValue(change.item, change.field);
    if (!valuesEqual(change.field, finalValue, change.proposed)) {
      throw new Error(
        `A verificação pós-escrita falhou para ${change.finding.itemKey}:${change.field}.`,
      );
    }
  }
  const log = readChangeLog();
  writeChangeLog(
    log.concat(
      changes.map((change) => ({
        batchID,
        timestamp,
        libraryID: collection.libraryID,
        itemKey: change.finding.itemKey,
        field: change.field,
        oldValue: change.current,
        newValue: change.proposed,
        decision: "approved",
        confidence: change.finding.confidence,
        sources: change.finding.sources,
      })),
    ),
  );
  ztoolkit.getGlobal("alert")(
    `${changes.length} alteração(ões) aplicadas, verificadas e registradas no log.`,
  );
}

export async function restoreLastChanges(): Promise<void> {
  const log = readChangeLog();
  if (!log.length) {
    ztoolkit.getGlobal("alert")(
      "Não há alterações registradas para restaurar.",
    );
    return;
  }
  const batchID = log[log.length - 1].batchID;
  const entries = log.filter((entry) => entry.batchID === batchID);
  const changes = entries.map((entry) => {
    const item = (Zotero as any).Items.getByLibraryAndKey(
      entry.libraryID,
      entry.itemKey,
    );
    if (!item) throw new Error(`Item ${entry.itemKey} não foi encontrado.`);
    const current = itemValue(item, entry.field);
    if (!valuesEqual(entry.field, current, entry.newValue)) {
      throw new Error(
        `O item ${entry.itemKey} mudou desde a última operação. Restauração abortada.`,
      );
    }
    return { entry, item };
  });
  await (Zotero as any).DB.executeTransaction(async () => {
    for (const change of changes) {
      setItemValue(change.item, change.entry.field, change.entry.oldValue);
      await change.item.save();
    }
  });
  for (const change of changes) {
    if (
      !valuesEqual(
        change.entry.field,
        itemValue(change.item, change.entry.field),
        change.entry.oldValue,
      )
    ) {
      throw new Error(
        `A verificação da restauração falhou para ${change.entry.itemKey}:${change.entry.field}.`,
      );
    }
  }
  writeChangeLog(log.filter((entry) => entry.batchID !== batchID));
  ztoolkit.getGlobal("alert")(
    `${changes.length} alteração(ões) restauradas e verificadas.`,
  );
}

function showFinalDiff(
  request: AuditRequest,
  findings: AuditFinding[],
  proposedValues: string[],
): void {
  const diffDialog = new ztoolkit.Dialog(Math.max(3, findings.length + 2), 1)
    .addCell(0, 0, {
      tag: "h1",
      properties: { innerHTML: "Diff final da revisão" },
    })
    .addCell(1, 0, {
      tag: "p",
      properties: {
        innerHTML: `Coleção: ${escapeHTML(request.collection.name)} · ${findings.length} alteração(ões) aprovadas. Esta etapa ainda não escreve no Zotero.`,
      },
    });

  findings.forEach((finding, index) => {
    const current = valueText(finding.current);
    const proposed = valueText(proposedValues[index]);
    diffDialog.addCell(index + 2, 0, {
      tag: "label",
      namespace: "html",
      properties: {
        innerHTML: escapeHTML(
          `[${finding.itemKey}] ${finding.field}: ${current} → ${proposed} · confiança: ${finding.confidence}`,
        ),
      },
      styles: { width: "780px", padding: "4px 0" },
    });
  });

  diffDialog
    .addButton("Confirmar e aplicar alterações", "confirm", {
      callback: async () => {
        try {
          await applyApprovedChanges(request, findings, proposedValues);
        } catch (error) {
          ztoolkit.getGlobal("alert")(
            `Nenhuma alteração foi aplicada:\n${String(error)}`,
          );
        }
      },
    })
    .addButton("Cancelar", "cancel")
    .setDialogData({})
    .open("Zotero Hermes — diff final", {
      centerscreen: true,
      height: Math.min(700, 180 + findings.length * 28),
      width: 850,
      resizable: true,
    });
  addon.data.dialog = diffDialog;
}

function showProposalReview(
  request: AuditRequest,
  findings: AuditFinding[],
): void {
  const proposedValues = findings.map((finding) =>
    finding.proposed === null || finding.proposed === undefined
      ? ""
      : valueText(finding.proposed),
  );
  const reviewDialog = new ztoolkit.Dialog(Math.max(3, findings.length + 2), 2)
    .addCell(0, 0, {
      tag: "h1",
      properties: { innerHTML: "Revisão de propostas" },
    })
    .addCell(1, 0, {
      tag: "p",
      properties: {
        innerHTML: `Coleção: ${escapeHTML(request.collection.name)} · ${findings.length} proposta(s). Nenhuma alteração será aplicada.`,
      },
    });

  findings.forEach((finding, index) => {
    const inputID = `zotero-hermes-proposal-${index}`;
    reviewDialog
      .addCell(index + 2, 0, {
        tag: "label",
        namespace: "html",
        properties: {
          for: inputID,
          innerHTML: `${index + 1}. ${findingText(finding)}`,
        },
        styles: { width: "590px", padding: "4px 0" },
      })
      .addCell(index + 2, 1, {
        tag: "input",
        namespace: "html",
        properties: {
          type: "text",
          id: inputID,
          value: proposedValues[index],
        },
        listeners: [
          {
            type: "input",
            listener: (event: any) => {
              proposedValues[index] = String(event.target.value ?? "");
            },
          },
        ],
        styles: { width: "220px" },
      });
  });

  const saveDecisions = (decision: "approved" | "rejected") => {
    const timestamp = new Date().toISOString();
    findings.forEach((finding, index) => {
      reviewSession.set(`${finding.itemKey}:${finding.field}`, {
        itemKey: finding.itemKey,
        field: finding.field,
        decision,
        proposed: proposedValues[index],
        timestamp,
      });
    });
    ztoolkit.getGlobal("alert")(
      `${findings.length} proposta(s) marcadas como ${decision === "approved" ? "aprovadas" : "rejeitadas"} nesta sessão. Nenhuma alteração foi aplicada no Zotero.`,
    );
    if (decision === "approved") {
      showFinalDiff(request, findings, proposedValues);
    }
  };

  reviewDialog
    .addButton("Aprovar propostas", "approve", {
      callback: () => saveDecisions("approved"),
    })
    .addButton("Rejeitar propostas", "reject", {
      callback: () => saveDecisions("rejected"),
    })
    .addButton("Cancelar", "cancel")
    .setDialogData({})
    .open("Zotero Hermes — revisão", {
      centerscreen: true,
      height: Math.min(700, 180 + findings.length * 32),
      width: 900,
      resizable: true,
    });
  addon.data.dialog = reviewDialog;
}

function showAuditResults(request: AuditRequest, result: AuditResult): void {
  const findings = Array.isArray(result.findings) ? result.findings : [];
  const dialog = new ztoolkit.Dialog(Math.max(3, findings.length + 2), 2)
    .addCell(0, 0, {
      tag: "h1",
      properties: {
        innerHTML: `Auditoria: ${escapeHTML(request.collection.name)}`,
      },
    })
    .addCell(1, 0, {
      tag: "p",
      properties: {
        innerHTML: `Itens analisados: ${request.items.length} · Achados: ${findings.length}`,
      },
    });

  const selectedIndexes = new Set<number>();
  findings.forEach((finding, index) => {
    const canReview =
      finding.proposed !== null && WRITABLE_FIELDS.has(finding.field);
    dialog
      .addCell(index + 2, 0, {
        tag: "input",
        namespace: "html",
        properties: {
          type: "checkbox",
          id: `zotero-hermes-finding-${index}`,
          "data-finding-index": String(index),
          disabled: !canReview,
        },
        listeners: [
          {
            type: "change",
            listener: (event: any) => {
              if (event.target.checked) selectedIndexes.add(index);
              else selectedIndexes.delete(index);
            },
          },
        ],
      })
      .addCell(index + 2, 1, {
        tag: "label",
        namespace: "html",
        properties: {
          for: `zotero-hermes-finding-${index}`,
          innerHTML: `${findingText(finding)}${WRITABLE_FIELDS.has(finding.field) ? "" : " · campo ainda não gravável"}`,
        },
        styles: { width: "760px", padding: "4px 0" },
      });
  });

  dialog
    .addButton("Revisar seleção", "review", {
      callback: () => {
        const selectedFindings = Array.from(selectedIndexes)
          .sort((a, b) => a - b)
          .map((index) => findings[index])
          .filter((finding): finding is AuditFinding => Boolean(finding));
        if (!selectedFindings.length) {
          ztoolkit.getGlobal("alert")(
            "Selecione pelo menos uma proposta para revisar.",
          );
          return;
        }
        showProposalReview(request, selectedFindings);
      },
      noClose: true,
    })
    .addButton("Fechar", "close")
    .setDialogData({})
    .open("Zotero Hermes — resultados", {
      centerscreen: true,
      height: Math.min(700, 180 + findings.length * 28),
      width: 850,
      resizable: true,
    });
  addon.data.dialog = dialog;
}

export async function auditSelectedCollection(): Promise<void> {
  const request = await buildAuditRequest();
  if (!request) {
    ztoolkit.getGlobal("alert")(
      "Selecione uma coleção do Zotero antes de auditar.",
    );
    return;
  }
  try {
    const baseURL = getPref("bridge-url").replace(/\/$/, "");
    const token = getPref("auth-token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await (Zotero as any).HTTP.request(
      "POST",
      `${baseURL}/v1/audits`,
      {
        body: JSON.stringify(request),
        headers,
        responseType: "text",
        timeout: getPref("request-timeout"),
      },
    );
    const result = JSON.parse(
      response.responseText ?? response.response ?? response,
    ) as AuditResult;
    showAuditResults(request, result);
  } catch (error) {
    ztoolkit.getGlobal("alert")(
      `Falha ao executar a auditoria no bridge:\n${String(error)}`,
    );
  }
}

export function registerCollectionAuditMenu(): void {
  const manager = (Zotero as any).MenuManager;
  if (manager?.registerMenu) {
    manager.registerMenu({
      menuID: "zotero-hermes-collection-audit",
      pluginID: addon.data.config.addonID,
      target: "main/library/collection",
      menus: [
        {
          menuType: "menuitem",
          l10nID: "audit-collection-menu",
          onCommand: () => void auditSelectedCollection(),
        },
        {
          menuType: "menuitem",
          label: "Restaurar última alteração do Hermes",
          onCommand: () => void restoreLastChanges(),
        },
      ],
    });
    return;
  }
  ztoolkit.Menu.register("collection" as any, {
    tag: "menuitem",
    id: "zotero-hermes-collection-audit",
    label: "Auditar coleção com Hermes",
    commandListener: () => void auditSelectedCollection(),
  });
}
