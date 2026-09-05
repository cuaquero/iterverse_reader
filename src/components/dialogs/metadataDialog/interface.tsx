export interface MetadataDialogProps {
  t: (title: string) => string;
  currentBookName: string;
  currentBookAuthor: string;
  handleMetadataDialog: (isShow: boolean) => void;
  handleApplyMetadata: (metadata: MetadataResult) => void;
}

export interface MetadataResult {
  name?: string;
  author?: string;
  publisher?: string;
  description?: string;
  publishedDate?: string;
  cover?: string;
}

export interface BookResultItem {
  key: string;
  name: string;
  author: string;
  publisher?: string;
  description?: string;
  cover?: string;
  source: "Google Books" | "Open Library";
}

export interface MetadataDialogState {
  searchName: string;
  searchAuthor: string;
  results: BookResultItem[];
  selectedId: string | null;
  isLoading: boolean;
  error: string;
}
