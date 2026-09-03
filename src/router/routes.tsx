import BookList from "../containers/lists/bookList";
import HomeList from "../containers/lists/homeList";
import DeletedBookList from "../containers/lists/deletedBookList";
import NoteList from "../containers/lists/noteList";
import EmptyPage from "../containers/emptyPage";

export const routes = [
  { path: "/manager/empty", component: EmptyPage },
  { path: "/manager/note", component: NoteList },
  { path: "/manager/highlight", component: NoteList },
  // "/manager/home" is the landing/"Books" view: HomeList shows the shared
  // catalog to students and the normal personal library (BookList) to
  // admins. Shelf/favorite/trash stay BookList/DeletedBookList for
  // everyone - those operate on whatever's already in the local library,
  // which for students is only ever books they opened from the catalog.
  { path: "/manager/home", component: HomeList },
  { path: "/manager/shelf", component: BookList },
  { path: "/manager/favorite", component: BookList },
  { path: "/manager/trash", component: DeletedBookList },
];
