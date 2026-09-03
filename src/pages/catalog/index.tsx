import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { stateType } from "../../store";
import Catalog from "./component";

const mapStateToProps = (state: stateType) => {
  return {
    isCollapsed: state.sidebar.isCollapsed,
    importBookFunc: state.book.importBookFunc,
  };
};

export default connect(mapStateToProps)(withTranslation()(Catalog as any) as any);
