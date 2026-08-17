import { RouteComponentProps } from "react-router";

export interface AdminProps extends RouteComponentProps<any> {
  t: (title: string) => string;
}

export interface AdminBook {
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

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: "student" | "admin";
  createdAt: string;
  lastLoginAt: string | null;
}

export type AdminViewState = "loading" | "unauthorized" | "ready";

export interface AdminState {
  view: AdminViewState;
  activeTab: "books" | "users";
  meUserId: string | null;

  books: AdminBook[];
  booksError: string | null;
  deletingBookId: string | null;

  uploadTitle: string;
  uploadAuthor: string;
  uploadFile: File | null;
  uploadCover: File | null;
  isUploading: boolean;
  uploadError: string | null;

  users: AdminUserRow[];
  usersError: string | null;
  updatingUserId: string | null;
}
