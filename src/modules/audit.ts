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

export async function auditSelectedCollection(): Promise<void> {
  const request = await buildAuditRequest();
  if (!request) {
    ztoolkit.getGlobal("alert")(
      "Selecione uma coleção do Zotero antes de auditar.",
    );
    return;
  }
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
  );
  const findingCount = Array.isArray(result.findings)
    ? result.findings.length
    : 0;
  ztoolkit.getGlobal("alert")(
    `Auditoria recebida para ${request.collection.name}.\nItens: ${request.items.length}\nAchados: ${findingCount}`,
  );
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
  // Compatibility path for Zotero versions without MenuManager.
  ztoolkit.Menu.register("collection" as any, {
    tag: "menuitem",
    id: "zotero-hermes-collection-audit",
    label: "Auditar coleção com Hermes",
    commandListener: () => void auditSelectedCollection(),
  });
}
