import { RouteComponentProps } from "react-router";

export interface LtiBridgeProps extends RouteComponentProps<any> {}

export interface LtiBridgeState {
  error: string | null;
}
