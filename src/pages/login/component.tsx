import React from "react";
import { LoginProps, LoginState } from "./interface";
import { Trans } from "react-i18next";
import { getLoginParamsFromUrl } from "../../utils/file/common";
import { withRouter } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import { loginList } from "../../constants/loginList";
import {
  generateSyncRecord,
  getServerRegion,
  handleAutoCloudSync,
  handleContextMenu,
  openInBrowser,
  removeSearchParams,
} from "../../utils/common";
import {
  CommonTool,
  ConfigService,
  KookitConfig,
  LoginHelper,
} from "../../assets/lib/kookit-extra-browser.min";
import { isElectron } from "react-device-detect";
import { driveList } from "../../constants/driveList";
import {
  getUserRequest,
  loginRegister,
  resetUserRequest,
} from "../../utils/request/user";
import SettingDialog from "../../components/dialogs/settingDialog";
import LoadingDialog from "../../components/dialogs/loadingDialog";
import { resetReaderRequest } from "../../utils/request/reader";
import { resetThirdpartyRequest } from "../../utils/request/thirdparty";

class Login extends React.Component<LoginProps, LoginState> {
  private lastLoginClickTime: number = 0;
  constructor(props: LoginProps) {
    super(props);
    this.state = {
      // Starts at the actual sign-in step - steps 0/1 were upstream's
      // mobile-app marketing carousel (Android/iOS promo, device-sync
      // blurb), which don't apply to this web-only BTECH fork and were
      // removed rather than reworded, since there's no real mobile app to
      // advertise in their place.
      currentStep: 2,
      loginConfig: {},
      countdown: 0,
      isSendingCode: false,
      serverRegion: getServerRegion(),
    };
  }

  componentDidMount() {
    if (isElectron) {
      const { ipcRenderer } = window.require("electron");
      ipcRenderer.on("oauth-callback", (_event, config) => {
        let code = config.code;
        let state = config.state;
        this.setState({ currentStep: 2 });
        if (state) {
          let { service } = JSON.parse(decodeURIComponent(state.split("|")[1]));
          this.handleLogin(code, service);
        }
      });
    } else {
      let url = document.location.href;
      if (url.indexOf("code") > -1) {
        let params: any = getLoginParamsFromUrl();
        let code = params.code;
        let state = params.state;
        this.setState({ currentStep: 2 });
        if (state) {
          let { service } = JSON.parse(decodeURIComponent(state.split("|")[1]));
          this.handleLogin(code, service);
        }
      }
    }
  }
  handleLogin = async (code: string, service: string) => {
    if (!service || !code) {
      toast.error(this.props.t("Missing parameters") + this.props.t("Token"));
      return;
    }
    this.props.handleLoadingDialog(true);
    let res = await loginRegister(service, code);
    if (res.code === 200) {
      this.props.handleLoadingDialog(false);
      let result = await handleAutoCloudSync();
      if (result) {
        this.props.cloudSyncFunc();
      } else {
        ConfigService.removeItem("defaultSyncOption");
        ConfigService.removeItem("dataSourceList");
      }

      this.props.handleFetchDataSourceList();
      this.props.handleFetchDefaultSyncOption();
      removeSearchParams();
      this.props.handleFetchAuthed();
      await this.props.handleFetchUserInfo();
      toast.success(this.props.t("Login successful"));
      this.setState({ currentStep: result ? 4 : 3 });
      if (ConfigService.getReaderConfig("isProUpgraded") !== "yes") {
        try {
          ConfigService.setReaderConfig("isProUpgraded", "yes");
          await generateSyncRecord();
        } catch (error) {
          console.error(error);
        }
      }
    } else {
      this.props.handleLoadingDialog(false);
      if (service === "email") {
        toast(this.props.t("Please make sure the email and code are correct"));
      }
      toast.error(this.props.t("Login failed, error code") + ": " + res.msg);
    }
  };
  handleServerRegionChange = (region: string) => {
    ConfigService.setItem("serverRegion", region);
    this.setState({ serverRegion: region });
    resetReaderRequest();
    resetUserRequest();
    resetThirdpartyRequest();
  };

  render() {
    return (
      <>
        <Toaster
          toastOptions={{
            style: {
              wordWrap: "break-word",
              wordBreak: "break-word",
              whiteSpace: "normal",
              overflowWrap: "break-word",
            },
          }}
        />
        <div
          className="login-close-container"
          onClick={() => {
            this.props.history.push("/manager/home");
          }}
        >
          <span className="icon-close login-close-icon theme-color-delete"></span>
        </div>
        {this.props.isSettingOpen && <SettingDialog />}
        {this.props.isShowLoading && <LoadingDialog />}
        {this.state.currentStep === 2 && (
          <div
            className="login-container"
            style={{
              backgroundColor: "#dcd7c7",
            }}
          >
            <div
              className="login-cover-container"
              style={{
                backgroundColor: "#e4e1d8",
              }}
            >
              <div className="login-logo">
                <img
                  src={require("../../assets/images/btech/logo-horizontal.png")}
                  alt="logo"
                  className="login-logo-img"
                />
              </div>

              <img
                src={require("../../assets/images/background3.png")}
                alt="cover"
                className="login-cover-img"
              />
            </div>
            <div className="login-content-container">
              <div
                className="login-title"
                style={{
                  marginTop: "50px",
                  marginBottom: "30px",
                  color: "var(--btech-gray)",
                }}
              >
                {this.props.t("Sign in to Iterverse Reader")}
              </div>
              <div className="btech-signin-box">
                <div>
                  {/* Server region (Global/China) selects between Koodo's
                      own hosted backend regions - meaningless once this app
                      talks to its own Cloudflare backend instead, and BTECH
                      has no China deployment for it to matter to. Hidden,
                      not deleted, in case the toggle needs to come back for
                      some other reason later. */}
                  {/* Iterverse platform auth (Cloudflare Access, OTP) - see
                      platform-auth/README.md in the ad_labs repo. The only
                      login path actually wired to this app's own backend
                      right now: LTI isn't happening, Google/Microsoft need
                      BTECH student accounts provisioned first. A real <a>,
                      not an onClick/fetch - this needs a top-level
                      navigation for Access to intercept and run its OTP
                      challenge before the request ever reaches
                      /api/auth/access. */}
                  <a className="btech-signin-button" href="/api/auth/access">
                    <span className="icon-email"></span>
                    {this.props.t("Continue with your BTECH email")}
                  </a>
                  {/* Google/Microsoft/email-code login (loginList) and the
                      manual-credentials entry point all still resolve
                      against Koodo's own real backend (see CLAUDE.md's
                      "client isn't wired up to this backend yet") - showing
                      them would just be broken buttons pointing at another
                      company's login system. Hidden, not deleted: this
                      comes back once Google/Microsoft OAuth apps are
                      registered and BTECH provisions student accounts for
                      Microsoft to work against (see LTI.md's status notes
                      on the same blocker). */}
                  {false && (
                    <>
                      {loginList.map((item) => {
                        return (
                          <div
                            className="login-option-container"
                            key={item.value}
                            style={{}}
                            onClick={() => {
                              if (item.value === "email") {
                                this.setState({ currentStep: 5 });
                                return;
                              }
                              let url = LoginHelper.getAuthUrl(
                                item.value,
                                isElectron ? "desktop" : "browser",
                                getServerRegion() === "china" &&
                                  item.value === "microsoft"
                                  ? KookitConfig.ThirdpartyConfig.cnCallbackUrl
                                  : KookitConfig.ThirdpartyConfig.callbackUrl
                              );
                              if (url) {
                                if (isElectron) {
                                  openInBrowser(url);
                                } else {
                                  window.location.replace(url);
                                }
                              }
                            }}
                          >
                            <div className="login-option-icon">
                              <span
                                className={item.icon + " login-option-icon"}
                                style={{ fontSize: item.fontsize }}
                              ></span>
                            </div>
                            <div className="login-option-title">
                              <Trans i18nKey="Continue with" label={item.label}>
                                Continue with {{ label: this.props.t(item.label) }}
                              </Trans>
                            </div>
                          </div>
                        );
                      })}
                      <div
                        className="login-manual-token"
                        onClick={() => {
                          this.props.handleSetting(true);
                          this.props.handleSettingMode("account");
                        }}
                      >
                        {this.props.t("Manually enter login credentials")}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {this.state.currentStep === 3 && (
          <div
            className="login-container"
            style={{
              backgroundColor: "#dcd7c7",
            }}
          >
            <div
              className="login-cover-container"
              style={{
                backgroundColor: "#e4e1d8",
              }}
            >
              <div className="login-logo">
                <img
                  src={require("../../assets/images/btech/logo-horizontal.png")}
                  alt="logo"
                  className="login-logo-img"
                />
              </div>

              <img
                src={require("../../assets/images/background3.png")}
                alt="cover"
                className="login-cover-img"
              />
            </div>
            <div className="login-content-container">
              <div
                className="login-title"
                style={{ marginTop: "80px", marginBottom: "10%" }}
              >
                {this.props.t(
                  "Add a data source for data synchronization and backup"
                )}
              </div>
              <div className="login-sync-container">
                {driveList
                  .filter((item) => {
                    if (!isElectron) {
                      return item.support.includes("browser");
                    } else {
                      return true;
                    }
                  })
                  .filter((item) => {
                    if (isElectron && process.platform !== "darwin") {
                      return item.value !== "icloud";
                    }
                    return true;
                  })
                  .map((item) => {
                    return (
                      <div
                        className="login-sync-box"
                        key={item.value}
                        style={{}}
                        onClick={() => {
                          this.props.handleSetting(true);
                          this.props.handleSettingMode("sync");
                          this.props.handleSettingDrive(item.value);
                        }}
                      >
                        <div className="login-sync-title">
                          {this.props.t(item.label)}
                        </div>
                        <div className="login-sync-icon-container">
                          <span className={"icon-add login-sync-icon"}></span>
                        </div>
                        {ConfigService.getReaderConfig("lang") &&
                          ConfigService.getReaderConfig("lang").startsWith(
                            "zh"
                          ) &&
                          item.value === "webdav" &&
                          isElectron && (
                            <div className="login-sync-text">
                              {this.props.t("Recommended (use with Nutstore)")}
                            </div>
                          )}
                        {ConfigService.getReaderConfig("lang") &&
                          ConfigService.getReaderConfig("lang").startsWith(
                            "zh"
                          ) &&
                          item.value === "microsoft" && (
                            <div className="login-sync-text">
                              {this.props.t("Access may be unstable in China")}
                            </div>
                          )}
                        {ConfigService.getReaderConfig("lang") &&
                          ConfigService.getReaderConfig("lang").startsWith(
                            "zh"
                          ) &&
                          item.value === "yiyiwu" && (
                            <div className="login-sync-text">
                              {this.props.t("Only recommended for VIP users")}
                            </div>
                          )}
                        <div className="login-sync-subtitle">
                          <div>
                            {item.support.map((support) => {
                              return (
                                <span
                                  key={support}
                                  className={
                                    "icon-" + support + " login-sync-support"
                                  }
                                ></span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
              <div
                className="login-next-button"
                onClick={() => {
                  this.setState({
                    currentStep: 4,
                  });
                }}
                style={{
                  borderWidth: "0px",
                  right: "0px",
                  // bottom: "10px",
                }}
              >
                {this.props.t("Skip")}
              </div>
            </div>
          </div>
        )}
        {this.state.currentStep === 4 && (
          <div
            className="login-container"
            style={{
              backgroundColor: "#dcd7c7",
            }}
          >
            <div
              className="login-cover-container"
              style={{
                backgroundColor: "#e4e1d8",
              }}
            >
              <div className="login-logo">
                <img
                  src={require("../../assets/images/btech/logo-horizontal.png")}
                  alt="logo"
                  className="login-logo-img"
                />
              </div>

              <img
                src={require("../../assets/images/background3.png")}
                alt="cover"
                className="login-cover-img"
              />
            </div>
            <div className="login-content-container">
              <div
                className="login-title"
                style={{ marginTop: "50px", marginBottom: "20px" }}
              >
                {this.props.t("You're all set")}
              </div>
              <div
                className="login-next-button"
                onClick={() => {
                  this.props.history.push("/manager/home");
                }}
                style={{
                  borderWidth: "0px",
                  right: "0px",
                }}
              >
                {this.props.t("Finish")}
              </div>
            </div>
          </div>
        )}
        {this.state.currentStep === 5 && (
          <div
            className="login-container"
            style={{
              backgroundColor: "#dcd7c7",
            }}
          >
            <div
              className="login-cover-container"
              style={{
                backgroundColor: "#e4e1d8",
              }}
            >
              <div className="login-logo">
                <img
                  src={require("../../assets/images/btech/logo-horizontal.png")}
                  alt="logo"
                  className="login-logo-img"
                />
              </div>

              <img
                src={require("../../assets/images/background3.png")}
                alt="cover"
                className="login-cover-img"
              />
            </div>
            <div className="login-content-container">
              <div
                className="login-title"
                style={{ marginTop: "80px", marginBottom: "50px" }}
              >
                {this.props.t("Sign in to Iterverse Reader")}
              </div>
              <div className="login-option-box">
                <div>
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
                    onContextMenu={() => {
                      handleContextMenu("token-dialog-email-box", true);
                    }}
                    onBlur={(e) => {
                      const email = e.target.value.trim();
                      if (email) {
                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (email && !emailRegex.test(email)) {
                          toast.error(this.props.t("Invalid email format"));
                          return;
                        }
                      }
                    }}
                    id={"token-dialog-email-box"}
                    className="login-input-container"
                    style={{}}
                  />
                  <div style={{ position: "relative" }}>
                    <input
                      type={"text"}
                      name={"code"}
                      placeholder={this.props.t("Enter code")}
                      onChange={(e) => {
                        if (e.target.value) {
                          this.setState((prevState) => ({
                            loginConfig: {
                              ...prevState.loginConfig,
                              ["token"]: e.target.value.trim(),
                            },
                          }));
                        }
                      }}
                      onContextMenu={() => {
                        handleContextMenu("token-dialog-token-box", true);
                      }}
                      id={"token-dialog-token-box"}
                      className="login-input-container"
                    />

                    <div
                      className="login-manual-token"
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
                      style={{
                        position: "absolute",
                        right: "30px",
                        top: "30px",
                        textAlign: "right",
                        cursor: "pointer",
                        fontSize: "15px",
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

                  <div
                    className="login-manual-token"
                    onClick={async () => {
                      if (
                        !this.state.loginConfig.token ||
                        !this.state.loginConfig.email
                      ) {
                        toast.error(
                          this.props.t("Missing parameters") +
                            this.props.t("Token")
                        );
                        return;
                      }
                      const now = Date.now();
                      if (now - this.lastLoginClickTime < 3000) {
                        toast.error(
                          this.props.t(
                            "You are clicking too fast, please try again later"
                          )
                        );
                        return;
                      }
                      this.lastLoginClickTime = now;
                      this.handleLogin(
                        this.state.loginConfig.email +
                          "#" +
                          this.state.loginConfig.token,
                        "email"
                      );
                    }}
                    style={{
                      margin: "10px",
                    }}
                  >
                    {this.props.t("Continue")}
                  </div>
                  <div className="login-term">
                    {this.props.t(
                      "7-days free trial only applies to users who registered with recommended email providers. Recommended email providers are as follows"
                    )}
                    <br />
                    {CommonTool.EmailProviders.join(", ")}
                  </div>
                  <div
                    className="login-next-button"
                    onClick={() => {
                      this.setState({
                        currentStep: 2,
                      });
                    }}
                    style={{
                      borderWidth: "0px",
                      right: "0px",
                    }}
                  >
                    {this.props.t("Back")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }
}

export default withRouter(Login as any);
