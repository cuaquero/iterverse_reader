import React from "react";
import { SettingInfoProps, SettingInfoState } from "./interface";
import { Trans } from "react-i18next";
import { generateSyncRecord, vexComfirmAsync } from "../../../utils/common";

import toast from "react-hot-toast";
import { backup } from "../../../utils/file/backup";
import { restore } from "../../../utils/file/restore";

// This deployment has no Koodo-hosted cloud backend and no third-party
// cloud-drive accounts (Dropbox/Google Drive/OneDrive/WebDAV/S3/etc) - those
// all required a Koodo Pro subscription this app doesn't sell, and library
// metadata already syncs through this app's own backend automatically.
// Personal book *file* bytes are intentionally local-only (see repo docs),
// so the one sync/backup feature that's still real and useful here is a
// local, no-account backup/restore of the whole library to/from a zip file
// on this device.
//
// Admin-only (gated in settingDialog/component.tsx, not here): the backup
// zip includes actual book file bytes, not just notes/highlights/settings.
// Originally left open to students too, on the assumption their personal
// library only ever held their own files - that stopped being true once
// students could successfully download and read admin-curated catalog
// books, at which point this became a way to walk off with a permanent,
// unmanaged copy of the whole catalog. Don't reopen this to students
// without a plan for that.
class SyncSetting extends React.Component<SettingInfoProps, SettingInfoState> {
  constructor(props: SettingInfoProps) {
    super(props);
    this.state = {};
  }

  handleBackupLibrary = async () => {
    toast(this.props.t("Downloading, please wait"));
    let result = await backup("local");
    if (result) {
      toast.dismiss("backup");
      toast.success(this.props.t("Execute successful"));
      this.props.handleFetchBooks();
      await generateSyncRecord();
    } else {
      toast.dismiss("backup");
      toast.error(this.props.t("Backup failed"));
    }
  };

  handleRestoreLibrary = async () => {
    let confirmed = await vexComfirmAsync(
      this.props.t(
        "Restoring from a snapshot will overwrite your current data. Are you sure you want to continue?"
      )
    );
    if (!confirmed) {
      return;
    }
    toast(this.props.t("Downloading, please wait"));
    let result = await restore("local");
    if (result) {
      toast.dismiss("backup");
      toast.success(this.props.t("Execute successful"));
      this.props.handleFetchBooks();
      await generateSyncRecord();
      setTimeout(() => {
        this.props.history.push("/manager/home");
      }, 2000);
    } else {
      toast.dismiss("backup");
      toast.error(this.props.t("Download failed,network problem or no backup"));
    }
  };

  render() {
    return (
      <>
        <div className="setting-dialog-new-title">
          <Trans>Backup library</Trans>
          <span
            className="change-location-button"
            onClick={this.handleBackupLibrary}
          >
            <Trans>Backup</Trans>
          </span>
        </div>
        <p className="setting-option-subtitle">
          <Trans>
            {
              "Downloads a zip file of your entire library (books, notes, highlights and settings) to this device"
            }
          </Trans>
        </p>
        <div className="setting-dialog-new-title">
          <Trans>Restore library</Trans>
          <span
            className="change-location-button"
            onClick={this.handleRestoreLibrary}
          >
            <Trans>Restore</Trans>
          </span>
        </div>
        <p className="setting-option-subtitle">
          <Trans>
            {
              "Restores your library from a previously downloaded backup zip file"
            }
          </Trans>
        </p>
      </>
    );
  }
}

export default SyncSetting;
