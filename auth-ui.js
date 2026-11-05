/* ログイン〜メール確認〜名簿チェックまでを担当する共通部品。
 * 登録メールアドレス → 名簿(staff) → 部署・権限、の順で本人を特定する。 */
(function () {
  var esc = function (s) { return window.UI.esc(s); };

  var ERR = {
    'auth/invalid-email': 'メールアドレスの形式が正しくありません。',
    'auth/user-not-found': 'このメールアドレスは登録されていません。「はじめての方」からアカウントを作ってください。',
    'auth/wrong-password': 'パスワードが違います。',
    'auth/invalid-credential': 'メールアドレスかパスワードが違います。',
    'auth/invalid-login-credentials': 'メールアドレスかパスワードが違います。',
    'auth/email-already-in-use': 'このメールアドレスはすでにアカウントがあります。「ログイン」からお入りください。',
    'auth/weak-password': 'パスワードは6文字以上にしてください。',
    'auth/too-many-requests': '何度も失敗したため一時的に制限されています。しばらくしてからお試しください。',
    'auth/network-request-failed': '通信に失敗しました。ネットワークをご確認ください。',
    'permission-denied': 'この内容は保存できません。月が変わったあとの入力（さかのぼり）や、提出・確定済みの内容、受付が終わった期間は変更できません。',
    'auth/operation-not-allowed': 'Firebaseの「メール/パスワード」ログインが有効になっていません（READMEの手順2）。'
  };
  function errText(e) { return ERR[e && e.code] || ('エラーが発生しました：' + ((e && e.message) || e)); }

  var DEMO_USERS = [
    { email: 'seizo@demo.local', label: '🌱 製造部の社員（花子さん）' },
    { email: 'seizo2@demo.local', label: '🔥 製造部の社員（太郎さん・出し忘れの月あり）' },
    { email: 'eigyo@demo.local', label: '🌸 営業部の社員（桜さん）' },
    { email: 'keiri@demo.local', label: '🌿 経理部の社員（葵さん）' },
    { email: 'admin@demo.local', label: '📋 管理者（福士さん）' }
  ];

  function start(opt) {
    var root = document.getElementById(opt.root);
    var cfg = window.APP_CONFIG || {};
    var mode = 'login';

    function shell(inner) {
      root.innerHTML = '<div class="login card">' + inner + '</div>';
    }
    function logoBlock(title, sub) {
      return '<div class="hero-emoji"><img class="login-logo" src="icons/icon-192.png" alt="" width="96" height="96"></div><h1>' + esc(cfg.appName || '成長ノート') + '</h1>' +
        '<p class="muted" style="text-align:center;margin-top:-6px">' + esc(title) + (sub ? '<br>' + esc(sub) : '') + '</p>';
    }

    function renderLogin(msg) {
      var demoBtns = window.Store.mode === 'demo'
        ? '<div class="msg info small">🧪 デモモードです（ブラウザ内のダミーデータ。Firebase未設定）。入る人を選んでください。</div><div class="demo-users">' +
          DEMO_USERS.filter(function (u) { return opt.admin ? u.email.indexOf('admin') === 0 : true; }).map(function (u) {
            return '<button class="btn sub" data-demo="' + u.email + '">' + u.label + '</button>';
          }).join('') + '</div>'
        : '';
      var isSignup = mode === 'signup';
      shell(logoBlock(opt.admin ? '管理画面ログイン（管理者のみ）' : (cfg.companyName || '') + ' 力量評価のふりかえり') +
        (window.Store.mode === 'demo' ? demoBtns :
          '<div class="tabs" style="justify-content:center"><button class="tab ' + (!isSignup ? 'on' : '') + '" data-mode="login">ログイン</button>' +
          (opt.admin ? '' : '<button class="tab ' + (isSignup ? 'on' : '') + '" data-mode="signup">はじめての方</button>') + '</div>' +
          (msg ? '<div class="msg ' + (msg.ok ? 'ok' : 'err') + '">' + esc(msg.text) + '</div>' : '') +
          (isSignup ? '<div class="msg info small">会社に登録されたメールアドレスで作成してください。作成後、確認メールのリンクを押すと使えるようになります。</div>' : '') +
          '<label class="f" for="em">メールアドレス</label><input id="em" type="email" autocomplete="username" inputmode="email">' +
          '<label class="f" for="pw">パスワード' + (isSignup ? '（6文字以上）' : '') + '</label><input id="pw" type="password" autocomplete="' + (isSignup ? 'new-password' : 'current-password') + '">' +
          '<div style="margin-top:16px;text-align:center"><button class="btn" id="go">' + (isSignup ? 'アカウントを作る' : 'ログイン') + '</button></div>' +
          (!isSignup ? '<p class="small" style="text-align:center"><a href="#" id="forgot">パスワードを忘れたとき</a></p>' : '')) +
        (opt.admin ? '<p class="small" style="text-align:center"><a href="index.html">→ 本人画面へ</a></p>' : ''));

      root.querySelectorAll('[data-mode]').forEach(function (b) { b.onclick = function () { mode = b.dataset.mode; renderLogin(); }; });
      root.querySelectorAll('[data-demo]').forEach(function (b) { b.onclick = function () { window.Store.signIn(b.dataset.demo); }; });
      var go = document.getElementById('go');
      if (go) {
        var run = async function () {
          var email = document.getElementById('em').value.trim(), pw = document.getElementById('pw').value;
          if (!email || !pw) return renderLogin({ text: 'メールアドレスとパスワードを入力してください。' });
          go.disabled = true;
          try {
            if (mode === 'signup') await window.Store.signUp(email, pw); else await window.Store.signIn(email, pw);
          } catch (e) { renderLogin({ text: errText(e) }); document.getElementById('em').value = email; }
        };
        go.onclick = run;
        document.getElementById('pw').onkeydown = function (e) { if (e.key === 'Enter') run(); };
      }
      var fg = document.getElementById('forgot');
      if (fg) fg.onclick = async function (e) {
        e.preventDefault();
        var email = document.getElementById('em').value.trim();
        if (!email) return renderLogin({ text: '上の欄にメールアドレスを入れてから押してください。' });
        try { await window.Store.resetPassword(email); renderLogin({ ok: true, text: 'パスワード再設定のメールを送りました。' }); }
        catch (er) { renderLogin({ text: errText(er) }); }
      };
    }

    function renderVerify(user, msg) {
      shell(logoBlock('メールアドレスの確認') +
        '<div class="msg info"><b>' + esc(user.email) + '</b> に確認メールを送りました。<br>メール内のリンクを押してから、下のボタンを押してください。</div>' +
        (msg ? '<div class="msg ' + (msg.ok ? 'ok' : 'err') + '">' + esc(msg.text) + '</div>' : '') +
        '<div class="row" style="justify-content:center"><button class="btn" id="chk">確認しました</button><button class="btn sub small" id="resend">メールを再送</button><button class="btn gray small" id="out">ログアウト</button></div>');
      document.getElementById('chk').onclick = async function () {
        try { var u = await window.Store.refreshUser(); if (u && u.verified) return gate(u); renderVerify(user, { text: 'まだ確認できていません。メールのリンクを押してください。' }); }
        catch (e) { renderVerify(user, { text: errText(e) }); }
      };
      document.getElementById('resend').onclick = async function () {
        try { await window.Store.resendVerification(); renderVerify(user, { ok: true, text: '確認メールを再送しました（迷惑メールフォルダもご確認ください）。' }); }
        catch (e) { renderVerify(user, { text: errText(e) }); }
      };
      document.getElementById('out').onclick = function () { window.Store.signOut(); };
    }

    function renderBlocked(user, title, body) {
      shell(logoBlock(title) + '<div class="msg err">' + body + '</div>' +
        '<div class="row" style="justify-content:center"><button class="btn gray" id="out">ログアウト</button>' +
        (opt.admin ? '<a class="btn sub" href="index.html" style="text-decoration:none">本人画面へ</a>' : '') + '</div>');
      document.getElementById('out').onclick = function () { window.Store.signOut(); };
    }

    async function gate(user) {
      shell('<p class="muted" style="text-align:center">読み込み中…</p>');
      var staff;
      try { staff = await window.Store.getStaff(user.email); }
      catch (e) { return renderBlocked(user, '読み込みエラー', esc(errText(e)) + '<br>Firestoreのルールが反映されているか、READMEの手順をご確認ください。'); }
      if (!staff) return renderBlocked(user, '名簿に登録がありません',
        '<b>' + esc(user.email) + '</b> は、まだ社員名簿に登録されていません。<br>管理者に、このメールアドレスの登録を依頼してください。');
      if (staff.active === false) return renderBlocked(user, 'ご利用できません', 'このアカウントは現在、無効になっています。管理者にご確認ください。');
      if (opt.admin && staff.role !== 'admin') return renderBlocked(user, '管理者専用です', 'この画面は管理者のみ使えます。本人画面からご利用ください。');
      root.innerHTML = '';
      opt.onReady(user, staff);
    }

    window.Store.init().then(function () {
      window.Store.onAuth(function (user) {
        if (!user) { mode = 'login'; return renderLogin(); }
        if (!user.verified) return renderVerify(user);
        gate(user);
      });
    }).catch(function (e) {
      shell('<div class="msg err">起動に失敗しました：' + esc(e.message || e) + '</div>');
    });
  }

  window.AuthUI = { start: start, errText: errText };
})();
