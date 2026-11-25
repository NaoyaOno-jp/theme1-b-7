(() => {
  // Firebaseコンソールのウェブアプリ設定から転記した認証用の項目。
  const firebaseConfig = {
    apiKey: "AIzaSyA-g4XSUUJFuOxELoi4hVBs0tauCYKvaNk",
    authDomain: "ikiteru-d1e3d.firebaseapp.com",
    projectId: "ikiteru-d1e3d",
    appId: "1:979880283346:web:63088743315e65b235310b",
  };

  const configured = Object.values(firebaseConfig).every(Boolean);
  const canUseAuth = configured && location.protocol !== "file:";
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const dashboard = document.getElementById("dashboard");
  const watchedNameForm = document.getElementById("watchedNameForm");
  let authSetup;

  // 読み込み方はFirebase公式資料を参照。アプリの初期化と画面処理はイキテル用の実装。
  // https://firebase.google.com/docs/web/alt-setup#from-the-cdn
  // https://firebase.google.com/docs/auth/web/auth-state-persistence
  function getFirebase() {
    authSetup ??= Promise.all([
      import("https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js"),
    ]).then(async ([appSdk, authSdk]) => {
      const app = appSdk.initializeApp(firebaseConfig);
      const auth = authSdk.initializeAuth(app, {
        persistence: authSdk.browserSessionPersistence,
      });
      await auth.authStateReady();
      return { auth, authSdk };
    });
    return authSetup;
  }

  function authErrorMessage(error, fallback) {
    switch (error.code) {
      case "auth/network-request-failed":
        return "Firebaseに接続できません。通信状況を確認してください";
      case "auth/too-many-requests":
        return "時間をおいてからもう一度お試しください";
      case "auth/configuration-not-found":
      case "auth/operation-not-allowed":
        return "メールアドレスでの認証が有効になっていません。管理者にお問い合わせください";
      case "auth/invalid-email":
        return "メールアドレスの形式をご確認ください";
      case "auth/email-already-in-use":
        return "登録済みの場合はログインしてください";
      case "auth/weak-password":
      case "auth/password-does-not-meet-requirements":
        return "パスワードの条件を満たしているかご確認ください";
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
      case "auth/user-disabled":
        return "メールアドレスまたはパスワードをご確認ください";
      default:
        return fallback;
    }
  }

  async function setupLoginForms() {
    const loginPanel = document.getElementById("login");
    const registerPanel = document.getElementById("register");
    const loginButton = loginForm.querySelector("button[type=submit]");
    const registerButton = registerForm.querySelector("button[type=submit]");
    const availability = document.getElementById("authAvailability");
    const loginError = document.getElementById("errorMessage");
    const registrationError = document.getElementById("registrationError");
    const registrationSuccess = document.getElementById("registrationSuccess");

    function showAuthPanel(moveFocus = false) {
      const registering = location.hash === "#register";
      loginPanel.hidden = registering;
      registerPanel.hidden = !registering;
      if (registering) registrationSuccess.textContent = "";
      if (moveFocus) (registering ? registerForm : loginForm).elements.email.focus();
    }

    function setSubmitting(submitting) {
      loginButton.disabled = submitting;
      registerButton.disabled = submitting;
    }

    window.addEventListener("hashchange", () => showAuthPanel(true));
    showAuthPanel();

    if (!canUseAuth) {
      availability.textContent = location.protocol === "file:"
        ? "ログインと新規登録にはWebサーバーからこのページを開いてください"
        : "Firebaseの設定が未完了です。現在はログインと新規登録を利用できません";
      return;
    }

    availability.textContent = "認証を準備しています…";
    let firebase;
    try {
      firebase = await getFirebase();
    } catch {
      availability.textContent = "Firebaseの読み込みに失敗しました。ページを再読み込みしてください";
      return;
    }
    availability.textContent = "";
    const { auth, authSdk } = firebase;

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (loginButton.disabled) return;
      setSubmitting(true);
      loginButton.textContent = "ログイン中…";
      loginError.textContent = "";

      try {
        // Firebase公式のメール認証API。フォーム処理はこのアプリ用に実装。
        // https://firebase.google.com/docs/auth/web/password-auth#sign_in_a_user_with_an_email_address_and_password
        await authSdk.signInWithEmailAndPassword(
          auth, loginForm.elements.email.value.trim(), loginForm.elements.password.value
        );
        loginForm.elements.password.value = "";
        location.replace("index.html");
      } catch (error) {
        loginError.textContent = authErrorMessage(error, "ログインできませんでした。もう一度お試しください");
        loginButton.textContent = "ログイン";
        setSubmitting(false);
      }
    });

    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (registerButton.disabled) return;
      registrationError.textContent = "";

      const { email, password, passwordConfirm } = registerForm.elements;
      if (password.value !== passwordConfirm.value) {
        registrationError.textContent = "確認用のパスワードが一致しません";
        passwordConfirm.focus();
        return;
      }

      const address = email.value.trim();
      setSubmitting(true);
      registerButton.textContent = "登録中…";
      try {
        // Firebase公式のアカウント作成API。登録後にログイン画面へ戻す処理はこのアプリ用。
        // https://firebase.google.com/docs/auth/web/password-auth#create_a_password-based_account
        await authSdk.createUserWithEmailAndPassword(auth, address, password.value);
        await authSdk.signOut(auth);

        registerForm.reset();
        loginForm.elements.email.value = address;
        loginForm.elements.password.value = "";
        loginError.textContent = "";
        history.replaceState(null, "", "#login");
        showAuthPanel(true);
        registrationSuccess.textContent = "登録が完了しました。パスワードを入力してログインしてください";
      } catch (error) {
        registrationError.textContent = authErrorMessage(error, "新規登録できませんでした。もう一度お試しください");
      } finally {
        registerButton.textContent = "登録する";
        setSubmitting(false);
      }
    });

    setSubmitting(false);
  }

  async function getVerifiedUser() {
    const { auth, authSdk } = await getFirebase();
    const user = auth.currentUser;
    if (!user) return null;

    try {
      // Firebase公式APIでトークンを更新し、セッションを確認する。
      // https://firebase.google.com/docs/reference/js/auth.user#usergetidtoken
      await user.getIdToken(true);
      return user;
    } catch (error) {
      if (!["auth/user-disabled", "auth/user-token-expired", "auth/invalid-user-token", "auth/user-not-found"].includes(error.code)) {
        throw error;
      }
      await authSdk.signOut(auth);
      return null;
    }
  }

  async function signOutToLogin() {
    const { auth, authSdk } = await getFirebase();
    await authSdk.signOut(auth);
    location.replace("login.html");
  }

  function watchedNameKey(user) {
    return `ikiteru-theme1-b-7:watched-name:${user.uid}`;
  }

  async function setupWatchedNameForm() {
    if (!canUseAuth) {
      location.replace("login.html");
      return;
    }

    const input = document.getElementById("watchedNameInput");
    const status = document.getElementById("nameStatus");
    const errorMessage = document.getElementById("nameError");
    const logoutButton = document.getElementById("nameLogout");
    const isFirstSetup = watchedNameForm.dataset.mode === "setup";

    logoutButton?.addEventListener("click", async () => {
      logoutButton.disabled = true;
      try {
        await signOutToLogin();
      } catch {
        errorMessage.textContent = "ログアウトできませんでした。もう一度お試しください";
        logoutButton.disabled = false;
      }
    });

    window.addEventListener("pagehide", () => {
      watchedNameForm.hidden = true;
      input.value = "";
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) location.reload();
    });

    try {
      const user = await getVerifiedUser();
      if (!user) {
        location.replace("login.html");
        return;
      }

      const key = watchedNameKey(user);
      const savedName = localStorage.getItem(key) ?? "";
      if (isFirstSetup && savedName) {
        location.replace("index.html");
        return;
      }
      if (!isFirstSetup && !savedName) {
        location.replace("setup.html");
        return;
      }

      input.value = savedName;
      input.addEventListener("input", () => { errorMessage.textContent = ""; });
      watchedNameForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name || name.length > input.maxLength) {
          errorMessage.textContent = "名前を1〜40文字で入力してください";
          input.focus();
          return;
        }

        try {
          localStorage.setItem(key, name);
          location.replace("index.html");
        } catch {
          errorMessage.textContent = "名前を保存できませんでした。ブラウザーの保存設定を確認してください";
        }
      });

      status.textContent = "";
      watchedNameForm.hidden = false;
      input.focus();
    } catch (error) {
      status.textContent = "";
      errorMessage.textContent = error.name === "SecurityError"
        ? "名前を読み込めませんでした。ブラウザーの保存設定を確認してください"
        : authErrorMessage(error, "ログイン状態を確認できませんでした。ページを再読み込みしてください");
    }
  }

  function setupDashboard() {
    const sessionCheck = document.getElementById("session-check");
    const sessionMessage = document.getElementById("session-message");
    const retry = document.getElementById("retry-session");
    const logoutButton = document.getElementById("logout");
    const watchedName = document.getElementById("watched-name");

    async function logout() {
      logoutButton.disabled = true;
      try {
        await signOutToLogin();
        dashboard.hidden = true;
      } catch {
        sessionCheck.hidden = false;
        sessionMessage.textContent = "ログアウトできませんでした。もう一度お試しください";
        logoutButton.disabled = false;
      }
    }

    async function verifySession() {
      dashboard.hidden = true;
      sessionCheck.hidden = false;
      retry.hidden = true;
      sessionMessage.textContent = "ログイン状態を確認しています…";

      try {
        const user = await getVerifiedUser();
        if (!user) {
          location.replace("login.html");
          return;
        }

        const savedName = localStorage.getItem(watchedNameKey(user));
        if (!savedName) {
          location.replace("setup.html");
          return;
        }
        watchedName.textContent = savedName;
        sessionCheck.hidden = true;
        dashboard.hidden = false;
      } catch (error) {
        sessionMessage.textContent = error.name === "SecurityError"
          ? "名前を読み込めませんでした。ブラウザーの保存設定を確認してください"
          : authErrorMessage(error, "ログイン状態を確認できませんでした");
        retry.hidden = false;
      }
    }

    if (!canUseAuth) {
      location.replace("login.html");
      return;
    }

    logoutButton.addEventListener("click", logout);
    retry.addEventListener("click", () => location.reload());
    window.addEventListener("pagehide", () => { dashboard.hidden = true; });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) verifySession();
    });
    verifySession();
  }

  if (loginForm && registerForm) setupLoginForms();
  if (watchedNameForm) setupWatchedNameForm();
  if (dashboard) setupDashboard();
})();
