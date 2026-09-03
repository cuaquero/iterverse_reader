import { RouteComponentProps } from "react-router-dom";
export interface SettingInfoProps extends RouteComponentProps<any> {
  handleFetchDataSourceList: () => void;
  handleFetchDefaultSyncOption: () => void;
  handleFetchAuthed: () => void;
  t: (title: string) => string;
  isAuthed: boolean;
}
export interface SettingInfoState {}
