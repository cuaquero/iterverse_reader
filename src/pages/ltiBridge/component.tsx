import React from "react";
import { Trans } from "react-i18next";
import { withRouter } from "react-router-dom";
import { LtiBridgeProps, LtiBridgeState } from "./interface";
import { setLtiSessionToken } from "../../utils/storage/ltiSession";

// Landing page for the Canvas LTI launch handoff. functions/api/lti/launch.ts
// redirects here with a one-time code in the query string (delivered inside
// the URL fragment, so it never reaches the server) instead of a session
// cookie -- see LTI.md for why. This page's only job is to exchange that code
// for a session id and store it, then continue into the app.
class LtiBridge extends React.Component<LtiBridgeProps, LtiBridgeState> {
  constructor(props: LtiBridgeProps) {
    super(props);
    this.state = { error: null };
  }

  componentDidMount() {
    const code = new URLSearchParams(this.props.location.search).get("code");
    if (!code) {
      this.setState({ error: "Missing launch code." });
      return;
    }
    this.exchange(code);
  }

  exchange = async (code: string) => {
    try {
      const res = await fetch("/api/lti/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error("Exchange failed");
      const data = (await res.json()) as { sessionId: string };
      setLtiSessionToken(data.sessionId);
      this.props.history.replace("/manager/home");
    } catch {
      this.setState({
        error: "Launch failed. Please return to Canvas and try again.",
      });
    }
  };

  render() {
    if (this.state.error) {
      return (
        <div className="manager">
          <div className="empty-page-info-container" style={{ margin: 100 }}>
            <div className="empty-page-info-main">
              <Trans>{this.state.error}</Trans>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }
}

export default withRouter(LtiBridge as any);
