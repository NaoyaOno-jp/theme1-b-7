(() => {
  const POCKETBASE_URL = "http://127.0.0.1:8090";
  const TOKEN_KEY = "ikiteru.authToken";

  // PocketBaseの公式REST API仕様に基づき、このアプリ用に書いた共通の認証処理。
  async function requestToken(action, options) {
    const response = await fetch(`${POCKETBASE_URL}/api/collections/users/${action}`, {
      ...options,
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const error = new Error("PocketBaseの認証に失敗しました");
      error.status = response.status;
      throw error;
    }

    const { token } = await response.json();
    if (typeof token !== "string" || !token) {
      throw new Error("PocketBaseの応答に認証トークンがありません");
    }
    return token;
  }

  const form = document.getElementById("loginForm");
  if (form) {
    const button = form.querySelector("button[type=submit]");
    const errorMessage = document.getElementById("errorMessage");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = "ログイン中…";
      errorMessage.textContent = "";

      try {
        // PocketBase公式仕様「Auth with password」。identity と password を送る。
        // https://pocketbase.io/docs/api-records/#auth-with-password
        const token = await requestToken("auth-with-password", {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identity: form.elements.email.value.trim(),
            password: form.elements.password.value,
          }),
        });
        sessionStorage.setItem(TOKEN_KEY, token);
        form.elements.password.value = "";
        location.replace("index.html");
      } catch (error) {
        if (error.status === 400 || error.status === 401) {
          errorMessage.textContent = "メールアドレスまたはパスワードが正しくありません";
        } else if (error.status === 429) {
          errorMessage.textContent = "時間をおいてから、もう一度ログインしてください";
        } else {
          errorMessage.textContent = "ログインできませんでした。接続を確認してもう一度お試しください";
        }
        button.disabled = false;
        button.textContent = "ログイン";
      }
    });

    button.disabled = false;
  }

  const dashboard = document.getElementById("dashboard");
  if (dashboard) {
    const sessionCheck = document.getElementById("session-check");
    const sessionMessage = document.getElementById("session-message");
    const retry = document.getElementById("retry-session");

    function logout() {
      dashboard.hidden = true;
      sessionStorage.removeItem(TOKEN_KEY);
      location.replace("login.html");
    }

    async function verifySession() {
      dashboard.hidden = true;
      sessionCheck.hidden = false;
      retry.hidden = true;
      sessionMessage.textContent = "ログイン状態を確認しています…";

      try {
        const token = sessionStorage.getItem(TOKEN_KEY);
        if (!token) {
          logout();
          return;
        }

        // PocketBase公式仕様「Auth refresh」。Authorization に認証トークンを送る。
        // https://pocketbase.io/docs/api-records/#auth-refresh
        const refreshedToken = await requestToken("auth-refresh", {
          headers: { Authorization: token },
        });
        sessionStorage.setItem(TOKEN_KEY, refreshedToken);
        sessionCheck.hidden = true;
        dashboard.hidden = false;
      } catch (error) {
        if ([401, 403, 404].includes(error.status)) {
          logout();
          return;
        }
        sessionMessage.textContent = "ログイン状態を確認できませんでした。接続をご確認ください";
        retry.hidden = false;
      }
    }

    document.getElementById("logout").addEventListener("click", logout);
    retry.addEventListener("click", verifySession);
    window.addEventListener("pagehide", () => { dashboard.hidden = true; });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) verifySession();
    });
    verifySession();
  }
})();
