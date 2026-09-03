import React from "react";
import { SettingInfoProps, SettingInfoState } from "./interface";
import { Trans } from "react-i18next";

import toast from "react-hot-toast";
import {
  checkPlugin,
  handleContextMenu,
  openExternalUrl,
} from "../../../utils/common";

import DatabaseService from "../../../utils/storage/databaseService";
import { ConfigService } from "../../../assets/lib/kookit-extra-browser.min";
import { isElectron } from "react-device-detect";
declare var global: any;
class SettingDialog extends React.Component<
  SettingInfoProps,
  SettingInfoState
> {
  constructor(props: SettingInfoProps) {
    super(props);
    this.state = {
      isAddNew: false,
    };
  }
  render() {
    return (
      <>
        {this.state.isAddNew && (
          <div
            className="voice-add-new-container"
            style={{
              marginLeft: "25px",
              width: "calc(100% - 50px)",
              fontWeight: 500,
            }}
          >
            <textarea
              name="url"
              placeholder={this.props.t(
                "Paste the code of the plugin here, check out document to learn how to get more plugins"
              )}
              id="voice-add-content-box"
              className="voice-add-content-box"
              onContextMenu={() => {
                handleContextMenu("voice-add-content-box");
              }}
            />
            <div className="token-dialog-button-container">
              <div
                className="voice-add-confirm"
                onClick={async () => {
                  let value: string = (
                    document.querySelector(
                      "#voice-add-content-box"
                    ) as HTMLTextAreaElement
                  ).value;
                  if (value) {
                    let plugin = JSON.parse(value);
                    plugin.key = plugin.identifier;
                    if (!(await checkPlugin(plugin))) {
                      toast.error(this.props.t("Plugin verification failed"));
                      return;
                    }

                    if (plugin.type === "voice" && !isElectron) {
                      toast.error(
                        this.props.t("Only desktop version supports TTS plugin")
                      );
                      return;
                    }
                    if (
                      plugin.type === "voice" &&
                      plugin.voiceList.length === 0
                    ) {
                      let voiceFunc = plugin.script;
                      // eslint-disable-next-line no-eval
                      eval(voiceFunc);
                      plugin.voiceList = await global.getTTSVoice(
                        plugin.config
                      );
                    }
                    if (
                      this.props.plugins.find((item) => item.key === plugin.key)
                    ) {
                      await DatabaseService.updateRecord(plugin, "plugins");
                    } else {
                      await DatabaseService.saveRecord(plugin, "plugins");
                    }
                    this.props.handleFetchPlugins();
                    toast.success(this.props.t("Addition successful"));
                  }
                  this.setState({ isAddNew: false });
                }}
              >
                <Trans>Confirm</Trans>
              </div>
              <div className="voice-add-button-container">
                <div
                  className="voice-add-cancel"
                  onClick={() => {
                    this.setState({ isAddNew: false });
                  }}
                >
                  <Trans>Cancel</Trans>
                </div>
              </div>
            </div>
          </div>
        )}
        <div
          style={{
            fontWeight: "bold",
            textAlign: "left",
            marginBottom: "20px",
            marginLeft: "30px",
            marginTop: "20px",
          }}
        >
          <span
            style={{}}
            onClick={async () => {
              this.setState({ isAddNew: true });
            }}
          >
            <Trans>Installed</Trans>
          </span>
        </div>

        {this.props.plugins &&
          this.props.plugins
            .filter((item) => item.type !== "ai")
            .map((item) => {
              return (
                <div className="setting-dialog-new-title" key={item.key}>
                  <span>
                    <span
                      className={`icon-${
                        item.type === "dictionary"
                          ? "dict"
                          : item.type === "voice"
                            ? "speaker"
                            : item.type === "translation"
                              ? "translation"
                              : "ai-assist"
                      } setting-plugin-icon`}
                    ></span>
                    <span className="setting-plugin-name">
                      {this.props.t(item.displayName)}
                    </span>
                  </span>

                  {!item.key.startsWith("official") &&
                    !item.key.startsWith("dict") &&
                    !item.key.startsWith("custom") && (
                      <span
                        className="change-location-button"
                        onClick={async () => {
                          await DatabaseService.deleteRecord(
                            item.key,
                            "plugins"
                          );
                          this.props.handleFetchPlugins();
                          toast.success(this.props.t("Deletion successful"));
                        }}
                      >
                        <Trans>Delete</Trans>
                      </span>
                    )}
                </div>
              );
            })}
        <div className="setting-dialog-new-plugin">
          <span
            style={{ textDecoration: "underline" }}
            onClick={() => {
              if (
                ConfigService.getReaderConfig("lang") &&
                ConfigService.getReaderConfig("lang").startsWith("zh")
              ) {
                openExternalUrl(
                  "https://github.com/koodo-reader/plugins/blob/main/README_CN.md"
                );
              } else {
                openExternalUrl(
                  "https://github.com/koodo-reader/plugins/blob/main/README.md"
                );
              }
            }}
          >
            <Trans>How to custom plugin</Trans>
          </span>
          <span
            style={{ marginLeft: "20px", fontWeight: "bold" }}
            onClick={async () => {
              const infoEl = document.querySelector(".setting-dialog-info");
              this.setState({ isAddNew: true }, () => {
                if (infoEl) infoEl.scrollTop = 0;
              });
            }}
          >
            <Trans>Add custom plugin</Trans>
          </span>
        </div>
      </>
    );
  }
}

export default SettingDialog;
