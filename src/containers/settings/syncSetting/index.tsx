import { connect } from "react-redux";
import SettingDialog from "./component";
import { withTranslation } from "react-i18next";
import { handleFetchBooks } from "../../../store/actions";
import { withRouter } from "react-router-dom";

const actionCreator = {
  handleFetchBooks,
};
export default connect(
  null,
  actionCreator
)(withTranslation()(withRouter(SettingDialog as any) as any) as any);
