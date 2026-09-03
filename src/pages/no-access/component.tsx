import React from "react";
import { Trans } from "react-i18next";
// Reuses login's own stylesheet/classes rather than a new one - this page
// is the one other place Iterverse platform auth can land someone (see
// functions/api/auth/access.ts), so it should look like it belongs next
// to the sign-in screen, not like a bolted-on error page.
import "../login/login.css";

const NoAccess: React.FC = () => {
  return (
    <div className="login-container" style={{ backgroundColor: "var(--btech-gray)" }}>
      <div
        className="login-cover-container"
        style={{ backgroundColor: "var(--btech-gray-dark)" }}
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
          <Trans>You're not enrolled in a course yet</Trans>
        </div>
        <div className="btech-signin-box">
          <p
            style={{
              color: "#ffffff",
              opacity: 0.75,
              maxWidth: 320,
              textAlign: "center",
              marginBottom: 24,
            }}
          >
            <Trans>
              Your account was verified, but it isn't rostered to any course
              that grants access here. Ask your instructor for an enrollment
              link, then try signing in again.
            </Trans>
          </p>
          <a className="btech-signin-button" href="/login">
            <Trans>Back to sign-in</Trans>
          </a>
        </div>
      </div>
    </div>
  );
};

export default NoAccess;
