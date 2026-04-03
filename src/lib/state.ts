/**
 * Session state — tracks the active collection for graph operations.
 */

export interface CollectionInfo {
  id: string;
  name: string;
  slug: string;
  surreal_db: string;
}

let activeCollection: CollectionInfo | null = null;

export function getActiveCollection(): CollectionInfo | null {
  return activeCollection;
}

export function setActiveCollection(col: CollectionInfo): void {
  activeCollection = col;
}

export function requireCollection(): CollectionInfo {
  if (!activeCollection) {
    throw new Error(
      "No collection selected. Call list_collections to see available collections, then set_collection to select one."
    );
  }
  return activeCollection;
}
