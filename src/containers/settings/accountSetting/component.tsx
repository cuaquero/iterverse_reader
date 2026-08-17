import React from "react";
import { SettingInfoProps, SettingInfoState } from "./interface";
import { Trans } from "react-i18next";
import { isElectron } from "react-device-detect";
import _ from "underscore";
import toast from "react-hot-toast";
import {
  getServerRegion,
  handleAutoCloudSync,
  handleContextMenu,
  openInBrowser,
  reloadManager,
  vexComfirmAsync,
} from "../../../utils/common";
import {
  CommonTool,
  ConfigService,
  KookitConfig,
  LoginHelper,
  TokenService,
} from "../../../assets/lib/kookit-extra-browser.min";
import { loginList } from "../../../constants/loginList";
import {
  getUserRequest,
  loginRegister,
  resetUserRequest,
} from "../../../utils/request/user";
import { handleClearToken, handleExitApp } from "../../../utils/request/common";
import copyTextToClipboard from "copy-text-to-clipboard";
import { resetReaderRequest } from "../../../utils/request/reader";
import { resetThirdpartyRequest } from "../../../utils/request/thirdparty";
declare var window: any;
class AccountSetting extends React.Component<
  SettingInfoProps,
  SettingInfoState
> {
  private lastBindClickTime: number = 0;
  constructor(props: SettingInfoProps) {
    super(props);
    this.state = {
      isAddNew: false,
      settingLogin: "",
      loginConfig: {},
      isSendingCode: false,
      countdown: 0,
      serverRegion: getServerRegion(),
    };
  }
  componentDidMount(): void {
    if (this.props.isAuthed) {
      this.props.handleFetchLoginOptionList();
      this.props.handleFetchUserInfo();
    }
  }
  handleRest = (_bool: boolean) => {
    toast.success(this.props.t("Change successful"));
  };
  handleJump = (url: string) => {
    openInBrowser(url);
  };
  handleSetting = (stateName: string) => {
    this.setState({ [stateName]: !this.state[stateName] } as any);
    ConfigService.setReaderConfig(
      stateName,
      this.state[stateName] ? "no" : "yes"
    );
    this.handleRest(this.state[stateName]);
  };
  handleLogout = async () => {
    await handleClearToken();

    this.props.handleFetchAuthed();
    this.props.handleLoginOptionList([]);
    this.props.handleFetchDataSourceList();
    this.props.handleFetchDefaultSyncOption();
    toast.success(this.props.t("Log out successful"));
  };
  handleAddLoginOption = (value: string) => {
    if (!value) {
      return;
    }
    this.setState({ settingLogin: value });
    if (value !== "email") {
      let url = LoginHelper.getAuthUrl(
        value,
        "manual",
        getServerRegion() === "china" && value === "microsoft"
          ? KookitConfig.ThirdpartyConfig.cnCallbackUrl
          : KookitConfig.ThirdpartyConfig.callbackUrl
      );
      this.handleJump(url);
    }
  };
  handleDeleteLoginOption = async (targetValue: string) => {
    if (!targetValue) {
      return;
    }
    if (this.props.loginOptionList.length === 1) {
      toast.error(this.props.t("At least one login option should be kept"));
      return;
    }
    toast.loading(this.props.t("Removing"), {
      id: "remove-login-option",
    });
    let userRequest = await getUserRequest();
    let response = await userRequest.removeLogin({
      provider: targetValue,
    });
    if (response.code === 200) {
      toast.success(this.props.t("Removal successful"), {
        id: "remove-login-option",
      });
      this.props.handleFetchLoginOptionList();
    } else if (response.code === 401) {
      toast.error(
        this.props.t("Removal failed, error code") + ": " + response.msg,
        {
          id: "remove-login-option",
        }
      );
      handleExitApp();
      return;
    } else {
      toast.error(
        this.props.t("Removal failed, error code") + ": " + response.msg,
        {
          id: "remove-login-option",
        }
      );
    }
  };
  handleCancelLoginOption = async () => {
    this.setState({ settingLogin: "" });
  };
  handleConfirmLoginOption = async () => {
    if (!this.state.loginConfig.token || !this.state.settingLogin) {
      toast.error(this.props.t("Missing parameters") + this.props.t("Token"));
      return;
    }
    const now = Date.now();
    if (now - this.lastBindClickTime < 3000) {
      toast.error(
        this.props.t("You are clicking too fast, please try again later")
      );
      return;
    }
    this.lastBindClickTime = now;
    toast.loading(this.props.t("Adding"), {
      id: "adding",
    });
    let userRequest = await getUserRequest();
    let res = await userRequest.addLogin({
      code: this.state.loginConfig.token,
      provider: this.state.settingLogin,
      scope:
        KookitConfig.LoginAuthRequest[this.state.settingLogin].extraParams
          .scope,
      redirect_uri:
        getServerRegion() === "china" && this.state.settingLogin === "microsoft"
          ? KookitConfig.ThirdpartyConfig.cnCallbackUrl
          : KookitConfig.ThirdpartyConfig.callbackUrl,
    });

    if (res.code === 200) {
      this.props.handleFetchLoginOptionList();
      toast.success(this.props.t("Addition successful"), {
        id: "adding",
      });
      this.setState({ settingLogin: "" });
    } else {
      if (this.state.settingLogin === "email") {
        toast(this.props.t("Please make sure the email and code are correct"));
      }
      toast.error(this.props.t("Login failed, error code") + ": " + res.msg, {
        id: "adding",
      });
    }
  };
  handleLoginRegister = async () => {
    if (!this.state.loginConfig.token || !this.state.settingLogin) {
      toast.error(this.props.t("Missing parameters") + this.props.t("Token"));
      return;
    }
    const now = Date.now();
    if (now - this.lastBindClickTime < 3000) {
      toast.error(
        this.props.t("You are clicking too fast, please try again later")
      );
      return;
    }
    this.lastBindClickTime = now;
    toast.loading(this.props.t("Logging in"), {
      id: "bind-login-option",
    });
    let res = await loginRegister(
      this.state.settingLogin,
      this.state.loginConfig.token
    );

    if (res.code === 200) {
      this.props.handleFetchAuthed();
      this.props.handleFetchLoginOptionList();
      let result = await handleAutoCloudSync();
      if (result) {
        this.props.cloudSyncFunc();
      } else {
        ConfigService.removeItem("defaultSyncOption");
        ConfigService.removeItem("dataSourceList");
      }
      toast.success(this.props.t("Login successful"), {
        id: "bind-login-option",
      });
      this.props.handleFetchDataSourceList();
      this.props.handleFetchDefaultSyncOption();
      this.props.handleFetchUserInfo();
      this.setState({ settingLogin: "" });
    } else {
      if (this.state.settingLogin === "email") {
        toast(this.props.t("Please make sure the email and code are correct"));
      }
      toast.error(this.props.t("Login failed, error code") + ": " + res.msg, {
        id: "bind-login-option",
      });
    }
  };
  render() {
    return (
      <>
        {(this.state.settingLogin === "google" ||
          this.state.settingLogin === "microsoft" ||
          this.state.settingLogin === "github") && (
          <div
            className="voice-add-new-container"
            style={{
              marginLeft: "25px",
              width: "calc(100% - 50px)",
              fontWeight: 500,
            }}
          >
            <textarea
              className="token-dialog-token-box"
              id="token-dialog-token-box"
              placeholder={this.props.t(
                "Please click the authorize button below to authorize your account, enter the obtained credentials here, and then click the bind button below"
              )}
              onContextMenu={() => {
                handleContextMenu("token-dialog-token-box");
              }}
              onChange={(e) => {
                if (e.target.value) {
                  this.setState((prevState) => ({
                    loginConfig: {
                      ...prevState.loginConfig,
                      token: e.target.value.trim(),
                    },
                  }));
                }
              }}
            />
            <div className="token-dialog-button-container">
              <div
                className="voice-add-confirm"
                onClick={async () => {
                  if (this.props.isAuthed) {
                    this.handleConfirmLoginOption();
                    return;
                  }
                  this.handleLoginRegister();
                }}
              >
                <Trans>Bind</Trans>
              </div>
              <div className="voice-add-button-container">
                <div
                  className="voice-add-cancel"
                  onClick={() => {
                    this.handleCancelLoginOption();
                  }}
                >
                  <Trans>Cancel</Trans>
                </div>

                <div
                  className="voice-add-confirm"
                  style={{ marginRight: "10px" }}
                  onClick={() => {
                    let url = LoginHelper.getAuthUrl(
                      this.state.settingLogin,
                      "manual",
                      getServerRegion() === "china" &&
                        this.state.settingLogin === "microsoft"
                        ? KookitConfig.ThirdpartyConfig.cnCallbackUrl
                        : KookitConfig.ThirdpartyConfig.callbackUrl
                    );
                    this.handleJump(url);
                  }}
                >
                  <Trans>Authorize</Trans>
                </div>
              </div>
            </div>
          </div>
        )}
        {this.state.settingLogin === "email" && (
          <div
            className="voice-add-new-container"
            style={{
              marginLeft: "25px",
              width: "calc(100% - 50px)",
              fontWeight: 500,
            }}
          >
            <input
              type={"text"}
              name={"email"}
              placeholder={this.props.t("Enter your email")}
              onChange={(e) => {
                if (e.target.value) {
                  this.setState((prevState) => ({
                    loginConfig: {
                      ...prevState.loginConfig,
                      ["email"]: e.target.value.trim(),
                    },
                  }));
                }
              }}
              onBlur={(e) => {
                const email = e.target.value.trim();
                if (email) {
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (email && !emailRegex.test(email)) {
                    toast.error(this.props.t("Invalid email format"));
                    return;
                  }
                  // clear code and token if email changed
                  this.setState((prevState) => ({
                    loginConfig: {
                      ...prevState.loginConfig,
                      ["token"]: "",
                    },
                  }));
                  //empty code box
                  const codeBox = document.getElementById(
                    "token-dialog-code-box"
                  ) as HTMLInputElement;
                  if (codeBox) {
                    codeBox.value = "";
                  }
                }
              }}
              onContextMenu={() => {
                handleContextMenu("token-dialog-email-box", true);
              }}
              id={"token-dialog-email-box"}
              className="token-dialog-username-box"
            />
            <input
              type={"text"}
              name={"code"}
              placeholder={this.props.t("Enter code")}
              onChange={(e) => {
                if (e.target.value) {
                  this.setState((prevState) => ({
                    loginConfig: {
                      ...prevState.loginConfig,
                      ["token"]:
                        this.state.loginConfig.email +
                        "#" +
                        e.target.value.trim(),
                    },
                  }));
                }
              }}
              onContextMenu={() => {
                handleContextMenu("token-dialog-code-box", true);
              }}
              id={"token-dialog-code-box"}
              className="token-dialog-username-box"
            />
            <div className="token-dialog-button-container">
              <div
                className="voice-add-confirm"
                onClick={async () => {
                  if (this.props.isAuthed) {
                    this.handleConfirmLoginOption();
                    return;
                  }
                  this.handleLoginRegister();
                }}
              >
                <Trans>Bind</Trans>
              </div>
              <div className="voice-add-button-container">
                <div
                  className="voice-add-cancel"
                  onClick={() => {
                    this.handleCancelLoginOption();
                  }}
                >
                  <Trans>Cancel</Trans>
                </div>

                <div
                  className="voice-add-confirm"
                  style={{
                    marginRight: "10px",
                    opacity:
                      this.state.isSendingCode || this.state.countdown
                        ? 0.6
                        : 1,
                  }}
                  onClick={async () => {
                    if (!this.state.loginConfig.email) {
                      toast.error(this.props.t("Enter your email"));
                      return;
                    }
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(this.state.loginConfig.email)) {
                      toast.error(this.props.t("Invalid email format"));
                      return;
                    }
                    if (this.state.isSendingCode || this.state.countdown) {
                      return;
                    }
                    this.setState({ isSendingCode: true });
                    toast.loading(this.props.t("Sending"), {
                      id: "send-email-code",
                    });
                    let userRequest = await getUserRequest();
                    let response = await userRequest.sendEmailCode({
                      email: this.state.loginConfig.email,
                      lang: ConfigService.getReaderConfig("lang"),
                    });
                    if (response.code === 200) {
                      toast.success(this.props.t("Send successfully"), {
                        id: "send-email-code",
                      });
                      toast(
                        this.props.t(
                          "If you didn't receive the verification code, please check the spam folder or use another email provider"
                        ),
                        {
                          duration: 6000,
                        }
                      );
                      this.setState({ isSendingCode: false });
                      let countdown = 60;
                      let timer = setInterval(() => {
                        countdown--;
                        this.setState({ countdown });
                        if (countdown === 0) {
                          clearInterval(timer);
                        }
                      }, 1000);
                    } else {
                      this.setState({ isSendingCode: false });
                      toast.error(
                        this.props.t("Failed to send code, error code") +
                          ": " +
                          response.msg,
                        { id: "send-email-code" }
                      );
                    }
                  }}
                >
                  {this.state.countdown ? (
                    this.state.countdown + "s"
                  ) : this.state.isSendingCode ? (
                    <Trans>Sending</Trans>
                  ) : (
                    <Trans>Send code</Trans>
                  )}
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: "13px",
                lineHeight: "16px",
                opacity: 0.6,
                marginTop: "10px",
              }}
            >
              {this.props.t(
                "7-days free trial only applies to users who registered with recommended email providers. Recommended email providers are as follows"
              )}
              <br />
              {CommonTool.EmailProviders.join(", ")}
            </div>
          </div>
        )}
        <div className="setting-dialog-new-title">
          <Trans>
            {this.props.isAuthed ? "Server region" : "Select server region"}
          </Trans>
          {this.props.isAuthed ? (
            <div
              className="lang-setting-option"
              style={{ display: "flex", alignItems: "center" }}
            >
              <Trans>
                {getServerRegion() === "china" ? "China" : "Global"}
              </Trans>
              <span
                className="change-location-button"
                style={{ marginLeft: "10px" }}
                onClick={async () => {
                  let result = await vexComfirmAsync(
                    "We have two server regions(Global and China). To change the server region, you need to log out first. Do you want to log out now?"
                  );
                  if (result) {
                    let newRegion =
                      getServerRegion() === "china" ? "global" : "china";
                    ConfigService.setItem("serverRegion", newRegion);
                    this.setState({
                      serverRegion: newRegion,
                    });
                    resetReaderRequest();
                    resetUserRequest();
                    resetThirdpartyRequest();
                    await this.handleLogout();
                  }
                }}
              >
                <Trans>Change</Trans>
              </span>
            </div>
          ) : (
            <select
              name=""
              className="lang-setting-dropdown"
              value={getServerRegion()}
              onChange={(event) => {
                if (!event.target.value) {
                  return;
                }
                ConfigService.setItem("serverRegion", event.target.value);
                this.setState({
                  serverRegion: event.target.value,
                });
                resetReaderRequest();
                resetUserRequest();
                resetThirdpartyRequest();
                toast.success(this.props.t("Setup successful"));
              }}
            >
              {[
                { value: "", label: "Please select" },
                { value: "global", label: "Global" },
                { value: "china", label: "China" },
              ].map((item) => (
                <option
                  value={item.value}
                  key={item.value}
                  className="lang-setting-option"
                >
                  {this.props.t(item.label)}
                </option>
              ))}
            </select>
          )}
        </div>
        {!this.props.isAuthed && (
          <>
            <div className="setting-dialog-new-title">
              <Trans>Select login method</Trans>
            </div>
            <div className="account-login-grid">
              {loginList.map((item) => {
                return (
                  <div
                    className="account-login-option"
                    key={item.value}
                    onClick={() => {
                      this.handleAddLoginOption(item.value);
                    }}
                  >
                    <span
                      className={item.icon + " account-login-option-icon"}
                      style={{ fontSize: item.fontsize }}
                    ></span>
                    <span className="account-login-option-label">
                      {this.props.t(item.label)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {this.props.isAuthed &&
          loginList.map((login) => (
            <div className="setting-dialog-new-title" key={login.value}>
              <Trans>{this.props.t(login.label)}</Trans>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                }}
                onClick={() => {
                  if (
                    !this.props.loginOptionList.find(
                      (item) => item.provider === login.value
                    )
                  ) {
                    this.handleAddLoginOption(login.value);
                  }
                }}
              >
                <div>
                  {this.props.loginOptionList.find(
                    (item) => item.provider === login.value
                  ) ? (
                    this.props.loginOptionList.find(
                      (item) => item.provider === login.value
                    )?.email ? (
                      <span>
                        {
                          this.props.loginOptionList.find(
                            (item) => item.provider === login.value
                          )?.email
                        }
                      </span>
                    ) : (
                      <span>{this.props.t("Bound")}</span>
                    )
                  ) : (
                    <span style={{ opacity: 0.4 }}>
                      {this.props.t("Not bound")}
                    </span>
                  )}
                </div>
                {this.props.loginOptionList.find(
                  (item) => item.provider === login.value
                ) ? (
                  <span
                    className="icon-trash"
                    style={{
                      fontSize: 13,
                      opacity: 0.8,
                      marginLeft: "10px",
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      this.handleDeleteLoginOption(login.value);
                    }}
                  ></span>
                ) : (
                  <span
                    className="icon-dropdown"
                    style={{
                      fontSize: 13,
                      opacity: 0.8,
                      transform: "rotate(-90deg)",
                      marginLeft: "10px",
                    }}
                  ></span>
                )}
              </div>
            </div>
          ))}

        {this.props.isAuthed && (
          <div className="setting-dialog-new-title">
            <Trans>Log out</Trans>

            <span
              className="change-location-button"
              onClick={async () => {
                await this.handleLogout();
                reloadManager();
              }}
            >
              <Trans>Log out</Trans>
            </span>
          </div>
        )}
        {this.props.isAuthed && (
          <div className="setting-dialog-new-title">
            <Trans>Get device identifier</Trans>

            <span
              className="change-location-button"
              onClick={async () => {
                let fingerPrint = await TokenService.getFingerprint();
                copyTextToClipboard(fingerPrint);
                toast.success(this.props.t("Copied"));
              }}
            >
              <Trans>Copy</Trans>
            </span>
          </div>
        )}
        {this.props.isAuthed && (
          <div className="setting-dialog-new-title">
            <Trans>Delete account</Trans>

            <span
              className="change-location-button"
              onClick={async () => {
                vexComfirmAsync(
                  this.props.t(
                    "To delete your account, you need to use the mobile app. After logging in, go to Settings → Account, and follow the instructions."
                  )
                );
              }}
            >
              <Trans>How to</Trans>
            </span>
          </div>
        )}
        {this.props.isAuthed && this.props.userInfo && (
          <div className="setting-dialog-new-title">
            <Trans>AI voice character quota</Trans>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span>
                {this.props.userInfo.type === "trial"
                  ? this.props.t("Trial quota")
                  : (this.props.userInfo && this.props.userInfo.free_credits
                      ? this.props.userInfo.free_credits
                      : 0) +
                    (this.props.userInfo &&
                    this.props.userInfo.tts_credits &&
                    this.props.userInfo.tts_credits > 0
                      ? " + " + this.props.userInfo.tts_credits
                      : "")}
              </span>
              <span
                className="change-location-button"
                style={{ marginLeft: "10px", cursor: "pointer" }}
                onClick={async () => {
                  toast.loading(this.props.t("Refreshing"), {
                    id: "refresh-user-info",
                  });
                  await this.props.handleFetchUserInfo();
                  toast.success(this.props.t("Refresh successful"), {
                    id: "refresh-user-info",
                  });
                }}
              >
                <Trans>Refresh</Trans>
              </span>
            </div>
          </div>
        )}
        {this.props.isAuthed && (
          <p className="setting-option-subtitle">
            {this.props.t(
              "Once the daily free quota is exhausted, the system will begin deducting from your purchased quota. The character count is calculated as follows, each letter, and punctuation mark counts as one character."
            )}
          </p>
        )}
      </>
    );
  }
}

export default AccountSetting;
