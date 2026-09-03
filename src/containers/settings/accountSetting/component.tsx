import React from "react";
import { SettingInfoProps, SettingInfoState } from "./interface";
import { Trans } from "react-i18next";
import toast from "react-hot-toast";
import { handleClearToken } from "../../../utils/request/common";
declare var window: any;
class AccountSetting extends React.Component<
  SettingInfoProps,
  SettingInfoState
> {
  constructor(props: SettingInfoProps) {
    super(props);
    this.state = {};
  }
  handleLogout = async () => {
    // Clears this app's own session (functions/api/auth/logout.ts) - separate
    // from handleClearToken()'s job below, which only ever cleared Koodo's
    // own OAuth token/account state. Without this, "Log out" would clear
    // the old, already-irrelevant token but leave the real session cookie
    // (and therefore access to the account) fully intact.
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("Failed to clear the server session:", error);
    }
    await handleClearToken();

    this.props.handleFetchAuthed();
    this.props.handleFetchDataSourceList();
    this.props.handleFetchDefaultSyncOption();
    toast.success(this.props.t("Log out successful"));
  };
  render() {
    return (
      <>
        {this.props.isAuthed && (
          <div className="setting-dialog-new-title">
            <Trans>Log out</Trans>

            <span
              className="change-location-button"
              onClick={async () => {
                await this.handleLogout();
                // A plain reload would just re-render whatever manager view
                // was already open - navigating to "/" runs Redirect's own
                // auth check (now correctly seeing no session) and lands
                // back on the real sign-in screen, same as a fresh visit.
                window.location.href = "/";
              }}
            >
              <Trans>Log out</Trans>
            </span>
          </div>
        )}
      </>
    );
  }
}

export default AccountSetting;
