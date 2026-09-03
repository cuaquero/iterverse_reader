import { connect } from "react-redux";
import SettingDialog from "./component";
import { withTranslation } from "react-i18next";
import {
  handleFetchAuthed,
  handleFetchDataSourceList,
  handleFetchDefaultSyncOption,
} from "../../../store/actions";
import { stateType } from "../../../store";
import { withRouter } from "react-router-dom";

const mapStateToProps = (state: stateType) => {
  return {
    isAuthed: state.manager.isAuthed,
  };
};
const actionCreator = {
  handleFetchDataSourceList,
  handleFetchDefaultSyncOption,
  handleFetchAuthed,
};
export default connect(
  mapStateToProps,
  actionCreator
)(withTranslation()(withRouter(SettingDialog as any) as any) as any);
