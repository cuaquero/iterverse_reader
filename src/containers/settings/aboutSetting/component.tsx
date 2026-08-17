import React from "react";
import { SettingInfoProps, SettingInfoState } from "./interface";
import { Trans } from "react-i18next";
import { ConfigService } from "../../../assets/lib/kookit-extra-browser.min";
import packageJson from "../../../../package.json";

import { getWebsiteUrl, openExternalUrl } from "../../../utils/common";
import { isElectron } from "react-device-detect";
declare var window: any;

class AboutSetting extends React.Component<SettingInfoProps, SettingInfoState> {
  constructor(props: SettingInfoProps) {
    super(props);
    this.state = {};
  }

  render() {
    return (
      <>
        <div className="setting-dialog-new-title">
          <Trans>Current version</Trans>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span>{packageJson.version}</span>
          </div>
        </div>
        {isElectron && (
          <div className="setting-dialog-new-title">
            <Trans>Get debug logs</Trans>
            <span
              className="change-location-button"
              onClick={async () => {
                const { ipcRenderer } = window.require("electron");
                ipcRenderer.invoke("get-debug-logs", "ping");
              }}
            >
              <Trans>Locate</Trans>
            </span>
          </div>
        )}

        {isElectron && (
          <div className="setting-dialog-new-title">
            <Trans>Open console</Trans>
            <span
              className="change-location-button"
              onClick={async () => {
                window
                  .require("electron")
                  .ipcRenderer.invoke("open-console", "ping");
              }}
            >
              <Trans>View</Trans>
            </span>
          </div>
        )}
        <div className="setting-dialog-new-title">
          <Trans>Document</Trans>

          <span
            className="change-location-button"
            onClick={async () => {
              if (
                ConfigService.getReaderConfig("lang") &&
                ConfigService.getReaderConfig("lang").startsWith("zh")
              ) {
                openExternalUrl(getWebsiteUrl() + "/zh/document");
              } else {
                openExternalUrl(getWebsiteUrl() + "/en/document");
              }
            }}
          >
            <Trans>Visit</Trans>
          </span>
        </div>
        <div className="setting-dialog-new-title">
          <Trans>Support</Trans>

          <span
            className="change-location-button"
            onClick={async () => {
              if (
                ConfigService.getReaderConfig("lang") &&
                ConfigService.getReaderConfig("lang").startsWith("zh")
              ) {
                openExternalUrl(getWebsiteUrl() + "/zh/support");
              } else {
                openExternalUrl(getWebsiteUrl() + "/en/support");
              }
            }}
          >
            <Trans>Visit</Trans>
          </span>
        </div>
        <div className="setting-dialog-new-title">
          <Trans>Shortcuts</Trans>

          <span
            className="change-location-button"
            onClick={async () => {
              if (
                ConfigService.getReaderConfig("lang") &&
                ConfigService.getReaderConfig("lang").startsWith("zh")
              ) {
                openExternalUrl(getWebsiteUrl() + "/zh/use-shortcut");
              } else {
                openExternalUrl(getWebsiteUrl() + "/en/use-shortcut");
              }
            }}
          >
            <Trans>Visit</Trans>
          </span>
        </div>
      </>
    );
  }
}

export default AboutSetting;
