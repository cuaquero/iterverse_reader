export interface CatalogBookSummary {
  id: string;
  title: string;
  author: string | null;
  format: string;
  fileSize: number;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
  hasCover: boolean;
}

export interface CatalogProps {
  t: (title: string) => string;
  isCollapsed: boolean;
  importBookFunc: (file: any) => Promise<void>;
}

export type CatalogViewState = "loading" | "error" | "ready";

export interface CatalogState {
  view: CatalogViewState;
  books: CatalogBookSummary[];
  error: string | null;
  openingId: string | null;
}
