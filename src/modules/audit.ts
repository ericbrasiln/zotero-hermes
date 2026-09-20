import { getPref } from "../utils/prefs";

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
  current: string;
  proposed: string | null;
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

function findingText(finding: AuditFinding): string {
  const current = finding.current
    ? `atual: ${finding.current}`
    : "atual: vazio";
  const proposed = finding.proposed
    ? ` · proposta: ${finding.proposed}`
    : " · proposta: nenhuma";
  const sources = finding.sources.length
    ? ` · fontes: ${finding.sources.join(", ")}`
    : "";
  return escapeHTML(
    `[${finding.itemKey}] ${finding.field} · ${current}${proposed} · confiança: ${finding.confidence} · ${finding.reason}${sources}`,
  );
}

function showProposalReview(
  request: AuditRequest,
  findings: AuditFinding[],
): void {
  const reviewDialog = new ztoolkit.Dialog(Math.max(3, findings.length + 2), 1)
    .addCell(0, 0, {
      tag: "h1",
      properties: { innerHTML: "Revisão de propostas" },
    })
    .addCell(1, 0, {
      tag: "p",
      properties: {
        innerHTML: `Coleção: ${escapeHTML(request.collection.name)} · ${findings.length} proposta(s) selecionada(s). Nenhuma alteração será aplicada.`,
      },
    });

  findings.forEach((finding, index) => {
    reviewDialog.addCell(index + 2, 0, {
      tag: "label",
      namespace: "html",
      properties: {
        innerHTML: `${index + 1}. ${findingText(finding)}`,
      },
      styles: { width: "760px", padding: "4px 0" },
    });
  });

  reviewDialog
    .addButton("Aprovar para próxima etapa", "approve", {
      callback: () => {
        ztoolkit.getGlobal("alert")(
          `Foram aprovadas ${findings.length} proposta(s) para a próxima etapa. Nenhuma alteração foi aplicada no Zotero.`,
        );
      },
    })
    .addButton("Rejeitar seleção", "reject", {
      callback: () => {
        ztoolkit.getGlobal("alert")(
          `Foram rejeitadas ${findings.length} proposta(s). Nenhuma alteração foi aplicada no Zotero.`,
        );
      },
    })
    .addButton("Cancelar", "cancel")
    .setDialogData({})
    .open("Zotero Hermes — revisão", {
      centerscreen: true,
      height: Math.min(700, 180 + findings.length * 28),
      width: 850,
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
    const canReview = finding.proposed !== null;
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
          innerHTML: findingText(finding),
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
