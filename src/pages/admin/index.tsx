import { withTranslation } from "react-i18next";
import { withRouter } from "react-router-dom";
import Admin from "./component";

export default withTranslation()(withRouter(Admin as any) as any) as any;
