import React from "react";
import BookList from "../bookList";
import Catalog from "../../../pages/catalog";
import { HomeListProps } from "./interface";

// Admins keep the normal personal library as the "home" view (they still
// import their own books via the header/drag-drop, gated in
// src/containers/header/component.tsx and src/pages/manager/component.tsx).
// Students get the admin-curated catalog instead - they can't personally
// import, so their "home" is browse-and-read from the shared catalog.
// Role starts out null until handleFetchAuthed's /api/auth/me round-trip
// resolves (see src/store/actions/manager.tsx); render nothing rather than
// flashing the wrong view while that's in flight.
class HomeList extends React.Component<HomeListProps> {
  render() {
    if (this.props.role === null) {
      return null;
    }
    return this.props.role === "admin" ? <BookList /> : <Catalog />;
  }
}

export default HomeList;
