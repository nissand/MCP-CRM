import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useState, useEffect } from "react";

// API URL for creating auth codes
const API_URL = "https://rare-sturgeon-827.convex.site";

// OAuth params storage key
const OAUTH_STORAGE_KEY = "mcp_oauth_params";

// Check if this is an OAuth flow from Claude
function getOAuthParams(): { redirectUri: string; state: string } | null {
  // First check URL params (initial redirect from /oauth/authorize)
  const params = new URLSearchParams(window.location.search);
  const redirectUri = params.get("oauth_redirect_uri");
  const state = params.get("oauth_state");

  if (redirectUri) {
    // Store in localStorage to persist through Google OAuth redirect
    const oauthParams = { redirectUri, state: state || "" };
    localStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify(oauthParams));
    return oauthParams;
  }

  // Check localStorage (after Google OAuth redirect back)
  const stored = localStorage.getItem(OAUTH_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  return null;
}

// Clear OAuth params after successful redirect
function clearOAuthParams() {
  localStorage.removeItem(OAUTH_STORAGE_KEY);
}

function SignIn() {
  const { signIn } = useAuthActions();
  const oauthParams = getOAuthParams();

  return (
    <div className="bg-white p-8 rounded-lg shadow-md max-w-lg w-full mx-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">MCP-CRM Authentication</h1>
      <p className="text-gray-600 mb-6">
        {oauthParams
          ? "Sign in to connect Claude to your CRM."
          : "Sign in to get your authentication token for Claude."}
      </p>

      <button
        onClick={() => signIn("google")}
        className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-lg px-6 py-3 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign in with Google
      </button>
    </div>
  );
}

function OAuthCallback() {
  const token = useAuthToken();
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleOAuthRedirect() {
      if (token && !redirecting) {
        const oauthParams = getOAuthParams();
        if (oauthParams && oauthParams.redirectUri) {
          setRedirecting(true);
          try {
            // Create a short authorization code via HTTP API
            const response = await fetch(`${API_URL}/oauth/code`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token,
                state: oauthParams.state || "",
              }),
            });

            if (!response.ok) {
              throw new Error(`Failed to create auth code: ${response.status}`);
            }

            const { code: authCode } = await response.json();

            // Clear stored params
            clearOAuthParams();

            // Redirect back to Claude with the short authorization code
            const callbackUrl = new URL(oauthParams.redirectUri);
            callbackUrl.searchParams.set("code", authCode);
            if (oauthParams.state) {
              callbackUrl.searchParams.set("state", oauthParams.state);
            }
            console.log("Redirecting to:", callbackUrl.toString());
            window.location.href = callbackUrl.toString();
          } catch (e) {
            console.error("Failed to create auth code:", e);
            setError(`Failed to create authorization code: ${e}`);
          }
        } else {
          setError("Missing OAuth redirect parameters");
        }
      }
    }
    handleOAuthRedirect();
  }, [token, redirecting]);

  if (error) {
    return (
      <div className="bg-white p-8 rounded-lg shadow-md max-w-lg w-full mx-4 text-center">
        <div className="text-red-600 mb-4">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Connection Error</h1>
        <p className="text-gray-600 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow-md max-w-lg w-full mx-4 text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <h1 className="text-xl font-bold text-gray-800 mb-2">Connecting to Claude...</h1>
      <p className="text-gray-600">Please wait while we complete the connection.</p>
    </div>
  );
}

function TokenDisplay() {
  const { signOut } = useAuthActions();
  const token = useAuthToken();
  const [copied, setCopied] = useState(false);

  // Check if this is an OAuth flow - if so, show callback component
  const oauthParams = getOAuthParams();
  if (oauthParams) {
    return <OAuthCallback />;
  }

  const copyToken = () => {
    if (token) {
      navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // For Claude Desktop / Claude Code - use headers for auth
  const claudeDesktopConfig = JSON.stringify({
    "mcpServers": {
      "mcp-crm": {
        "type": "http",
        "url": "https://rare-sturgeon-827.convex.site/mcp",
        "headers": {
          "Authorization": `Bearer ${token || "YOUR_TOKEN_HERE"}`
        }
      }
    }
  }, null, 2);

  // For Claude Cowork custom connector - URL with token as fallback
  const claudeCoworkUrl = `https://rare-sturgeon-827.convex.site/mcp?token=${token || "YOUR_TOKEN_HERE"}`;

  return (
    <div className="bg-white p-8 rounded-lg shadow-md max-w-2xl w-full mx-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">MCP-CRM Authentication</h1>

      <div className="flex items-center gap-2 text-green-600 mb-4">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
        </svg>
        <span className="font-medium">Signed in successfully!</span>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Your Auth Token:</label>
        <div className="relative">
          <textarea
            readOnly
            value={token || "Loading..."}
            className="w-full p-3 bg-gray-50 border border-gray-300 rounded-lg font-mono text-xs break-all resize-none"
            rows={4}
          />
          <button
            onClick={copyToken}
            className="absolute top-2 right-2 p-2 bg-white border border-gray-300 rounded hover:bg-gray-100"
            title="Copy to clipboard"
          >
            {copied ? (
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
              </svg>
            ) : (
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <h3 className="font-medium text-blue-800 mb-2">Claude Desktop / Claude Code Setup:</h3>
        <p className="text-sm text-blue-700 mb-2">
          Add this to your <code className="bg-blue-100 px-1 rounded">~/.claude/config.json</code> or <code className="bg-blue-100 px-1 rounded">claude_desktop_config.json</code>:
        </p>
        <pre className="text-xs bg-blue-100 p-3 rounded overflow-x-auto whitespace-pre-wrap">
          {claudeDesktopConfig}
        </pre>
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
        <h3 className="font-medium text-purple-800 mb-2">Claude Cowork Custom Connector:</h3>
        <p className="text-sm text-purple-700 mb-2">
          For Claude Cowork's custom connector, use this URL:
        </p>
        <input
          readOnly
          value={claudeCoworkUrl}
          className="w-full p-2 bg-purple-100 border border-purple-300 rounded font-mono text-xs"
        />
        <p className="text-xs text-purple-600 mt-2">
          When adding the connector, select <strong>"No authentication required"</strong> since the token is embedded in the URL.
        </p>
      </div>

      <button
        onClick={() => signOut()}
        className="w-full bg-gray-200 text-gray-700 rounded-lg px-4 py-2 font-medium hover:bg-gray-300 transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}

function Loading() {
  return (
    <div className="text-center py-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
      <p className="text-gray-600 mt-2">Loading...</p>
    </div>
  );
}

export default function App() {
  return (
    <div className="bg-gray-100 min-h-screen flex items-center justify-center">
      <AuthLoading>
        <Loading />
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        <TokenDisplay />
      </Authenticated>
    </div>
  );
}
