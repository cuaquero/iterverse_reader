import { RouteComponentProps } from "react-router-dom";
export interface SettingInfoProps extends RouteComponentProps<any> {
  handleSetting: (isSettingOpen: boolean) => void;
  handleSettingMode: (settingMode: string) => void;
  handleFetchDataSourceList: () => void;
  handleFetchDefaultSyncOption: () => void;
  handleFetchPlugins: () => void;
  t: (title: string) => string;
  settingMode: string;
  role: "student" | "admin" | null;
}
export interface SettingInfoState {}
