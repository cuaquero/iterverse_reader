import { connect } from "react-redux";
import { stateType } from "../../store";
import LtiBridge from "./component";
import { withRouter } from "react-router-dom";

const mapStateToProps = (_state: stateType) => {
  return {};
};

export default connect(mapStateToProps)(withRouter(LtiBridge as any) as any);
