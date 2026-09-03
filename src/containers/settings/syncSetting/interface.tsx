import { RouteComponentProps } from "react-router-dom";
export interface SettingInfoProps extends RouteComponentProps<any> {
  t: (title: string) => string;
  handleFetchBooks: () => void;
}
export interface SettingInfoState {}
