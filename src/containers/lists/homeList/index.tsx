import { connect } from "react-redux";
import { stateType } from "../../../store";
import HomeList from "./component";

const mapStateToProps = (state: stateType) => {
  return {
    role: state.manager.role,
  };
};

export default connect(mapStateToProps)(HomeList as any);
