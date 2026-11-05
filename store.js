/* データ層。Firebase（本番）とデモ（ブラウザ内ダミー）を同じ関数で切り替える。
 *
 * コレクション
 *   staff/{メール(小文字)}            名簿 {email,name,dept,role:'employee'|'admin',active}
 *   periods/{2026-H2}                 半年の評価期間 {id,label,startYm,endYm,startAt,endAt,status:'open'|'closed'}
 *   monthlyEvals/{YYYY-MM}__{メール}  月1回の自己評価（その月のうちにしか入力できない）
 *   goals/{期間}__{メール}            半年の目標 {goals:[{id,title,action}], status:'draft'|'fixed'}
 *   mgrEvals/{期間}__{メール}         管理者評価（released:true になるまで本人は読めない）。目標の達成度も含む
 *   suggestions/{id}                  提案ボックス {category,title,body,anonymous,status,reply,public}（本人は新規投稿のみ。状態・返事・公開は管理者）
 *   replies/{YYYY-MM}__{メール}       管理者から毎月の提出へのひとこと返信 {text,seen,reviewer,readAt}（本人は読むだけ。readAtだけ更新できる）
 *
 * 時刻の扱い: アプリ内では ms(数値) で持ち、Firestoreには Timestamp として保存する（ルールが日付を比べるため）。
 */
(function () {
  var CFG = window.APP_CONFIG || {};
  var S = window.Scoring;
  var params = new URLSearchParams(location.search);
  var demo = params.get('demo') === '1' || !(CFG.firebase && CFG.firebase.apiKey);
  var Store = { mode: demo ? 'demo' : 'firebase' };
  var FB_VERSION = '9.23.0';
  var db, auth;

  // デモのときだけ「今日」を差し替えられる（例 ?demo=1&now=2026-12-10）。本番では無効
  if (demo && params.get('now')) {
    var t = Date.parse(params.get('now') + 'T12:00:00+09:00');
    if (!isNaN(t)) window.__NOW_MS__ = t;
  }

  function idOf(key, email) { return key + '__' + String(email).toLowerCase(); }
  function lower(s) { return String(s || '').trim().toLowerCase(); }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = function () { reject(new Error('読み込めませんでした: ' + src)); };
      document.head.appendChild(s);
    });
  }
  function toTs(ms) { return firebase.firestore.Timestamp.fromMillis(ms); }
  function fromTs(t) { return t && t.toMillis ? t.toMillis() : t; }
  function mapDocs(q) { return q.docs.map(function (d) { return d.data(); }); }
  function normPeriod(p) { p.startAt = fromTs(p.startAt); p.endAt = fromTs(p.endAt); return p; }
  // 月は monthStart（サーバー時刻と照合済みの日付）で決める。ym ラベルや書類IDは信用しない
  function normMonthly(m) { m.monthStart = fromTs(m.monthStart); m.ym = S.ymOf(m.monthStart); return m; }
  // 同じ人・同じ月の書類が複数あっても1件にする（提出済み優先、次に新しいもの）
  function dedupe(list) {
    var map = {};
    list.forEach(function (m) {
      var k = m.email + '|' + m.ym, o = map[k];
      var better = !o || (m.status === 'submitted' && o.status !== 'submitted') ||
        ((m.status === 'submitted') === (o.status === 'submitted') && (m.updatedAt || 0) > (o.updatedAt || 0));
      if (better) map[k] = m;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  /* ====================== Firebase ====================== */
  var fb = {
    init: async function () {
      var mods = ['app', 'auth', 'firestore'];
      for (var i = 0; i < mods.length; i++) {
        await loadScript('https://www.gstatic.com/firebasejs/' + FB_VERSION + '/firebase-' + mods[i] + '-compat.js');
      }
      firebase.initializeApp(CFG.firebase);
      auth = firebase.auth(); db = firebase.firestore();
    },
    onAuth: function (cb) {
      auth.onAuthStateChanged(function (u) { cb(u ? { email: lower(u.email), verified: u.emailVerified } : null); });
    },
    signIn: async function (email, pw) {
      var c = await auth.signInWithEmailAndPassword(lower(email), pw);
      await c.user.reload(); await c.user.getIdToken(true);
    },
    signUp: async function (email, pw) {
      var c = await auth.createUserWithEmailAndPassword(lower(email), pw);
      await c.user.sendEmailVerification();
    },
    resendVerification: async function () { if (auth.currentUser) await auth.currentUser.sendEmailVerification(); },
    refreshUser: async function () {
      if (!auth.currentUser) return null;
      await auth.currentUser.reload(); await auth.currentUser.getIdToken(true);
      var u = auth.currentUser; return { email: lower(u.email), verified: u.emailVerified };
    },
    resetPassword: function (email) { return auth.sendPasswordResetEmail(lower(email)); },
    signOut: function () { return auth.signOut(); },

    getStaff: async function (email) { var s = await db.collection('staff').doc(lower(email)).get(); return s.exists ? s.data() : null; },
    listStaff: async function () { return mapDocs(await db.collection('staff').get()); },
    saveStaff: function (st) {
      var email = lower(st.email);
      var depts = S.deptsOf(st);
      return db.collection('staff').doc(email).set({ email: email, name: st.name || '', dept: depts[0] || '', depts: depts, certified: S.certifiedOf(st), role: st.role === 'admin' ? 'admin' : 'employee', active: st.active !== false });
    },

    listPeriods: async function () {
      return mapDocs(await db.collection('periods').get()).map(normPeriod).sort(function (a, b) { return a.id < b.id ? 1 : -1; });
    },
    savePeriod: function (p) {
      var d = Object.assign({}, p, { startAt: toTs(p.startAt), endAt: toTs(p.endAt) });
      return db.collection('periods').doc(p.id).set(d);
    },

    listMonthlyByEmail: async function (email) {
      return dedupe(mapDocs(await db.collection('monthlyEvals').where('email', '==', lower(email)).get()).map(normMonthly));
    },
    listMonthly: async function (period) {
      return dedupe(mapDocs(await db.collection('monthlyEvals').where('period', '==', period).get()).map(normMonthly));
    },
    saveMonthly: function (ym, email, data) {
      var d = Object.assign({}, data, { ym: ym, monthStart: toTs(S.ymStartMs(ym)) });
      return db.collection('monthlyEvals').doc(idOf(ym, email)).set(d);
    },

    listGoalsByEmail: async function (email) { return mapDocs(await db.collection('goals').where('email', '==', lower(email)).get()); },
    listGoals: async function (period) { return mapDocs(await db.collection('goals').where('period', '==', period).get()); },
    saveGoals: function (period, email, data) { return db.collection('goals').doc(idOf(period, email)).set(data); },

    listMgrReleasedByEmail: async function (email) {
      return mapDocs(await db.collection('mgrEvals').where('email', '==', lower(email)).where('released', '==', true).get());
    },
    listMgr: async function (period) { return mapDocs(await db.collection('mgrEvals').where('period', '==', period).get()); },
    saveMgr: function (period, email, data) { return db.collection('mgrEvals').doc(idOf(period, email)).set(data); },

    listRepliesByEmail: async function (email) { return mapDocs(await db.collection('replies').where('email', '==', lower(email)).get()); },
    listReplies: async function (period) { return mapDocs(await db.collection('replies').where('period', '==', period).get()); },
    saveReply: function (ym, email, data) { return db.collection('replies').doc(idOf(ym, email)).set(data); },
    markReplyRead: function (ym, email) { return db.collection('replies').doc(idOf(ym, email)).update({ readAt: Date.now() }); },

    listSuggestionsMine: async function (email) { return mapDocs(await db.collection('suggestions').where('email', '==', lower(email)).get()); },
    listSuggestionsPublic: async function () { return mapDocs(await db.collection('suggestions').where('public', '==', true).get()); },
    listSuggestions: async function () { return mapDocs(await db.collection('suggestions').get()); },
    saveSuggestion: function (id, data) { return db.collection('suggestions').doc(id).set(data); },
    deleteSuggestion: function (id) { return db.collection('suggestions').doc(id).delete(); }
  };

  /* ====================== デモ ====================== */
  var KEY = 'ce-demo-v2', SESSION = 'ce-demo-user';
  var authCbs = [];
  function rng(seed) { var x = seed; return function () { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; }; }
  function denied(msg) { var e = new Error(msg || 'permission-denied'); e.code = 'permission-denied'; return e; }

  function seedDemo() {
    var items = window.COMPETENCY_ITEMS, now = S.nowYm(), y = +now.slice(0, 4), m = +now.slice(5);
    var curStart = m >= 10 ? y + '-10' : (m >= 4 ? y + '-04' : (y - 1) + '-10');
    var prevStart = S.addMonths(curStart, -6);
    function mkPeriod(start, status) {
      var sy = +start.slice(0, 4), half = +start.slice(5) === 4 ? 1 : 2;
      return { id: sy + '-H' + half, label: sy + '年 ' + (half === 1 ? '上期' : '下期'), startYm: start, endYm: S.addMonths(start, 5),
        startAt: S.ymStartMs(start), endAt: S.ymStartMs(S.addMonths(start, 6)), status: status, createdAt: 1 };
    }
    var cur = mkPeriod(curStart, 'open'), prev = mkPeriod(prevStart, 'closed');
    var staff = [
      { email: 'seizo@demo.local', name: '製造 花子', dept: '製造部', depts: ['製造部', '営業部'], certified: ['製造部', '営業部'], role: 'employee', active: true },
      { email: 'seizo2@demo.local', name: '製造 太郎', dept: '製造部', role: 'employee', active: true },
      { email: 'eigyo@demo.local', name: '営業 桜', dept: '営業部', role: 'employee', active: true },
      { email: 'keiri@demo.local', name: '経理 葵', dept: '経理部', role: 'employee', active: true },
      { email: 'admin@demo.local', name: '福士（管理者）', dept: '', role: 'admin', active: true }
    ];
    var monthly = {}, goals = {}, mgr = {};
    function scoresFor(dept, seed, base, t) {
      var r = rng(seed), sc = {};
      S.itemsForDepts(items, [dept]).forEach(function (it) { sc[it.no] = Math.max(1, Math.min(4, Math.round(base + 0.1 * t + (r() - 0.5) * 2.0))); });
      return sc;
    }
    function addMonthly(staffRec, period, ym, sc, prog, t) {
      monthly[idOf(ym, staffRec.email)] = { ym: ym, period: period.id, email: staffRec.email, name: staffRec.name, dept: staffRec.dept,
        monthStart: S.ymStartMs(ym), scores: sc, comments: {}, goalProgress: prog || {}, goalNotes: {}, memo: '', status: 'submitted', updatedAt: t, submittedAt: t };
    }
    function addGoals(staffRec, period, list) {
      goals[idOf(period.id, staffRec.email)] = { period: period.id, email: staffRec.email, name: staffRec.name, dept: staffRec.dept, goals: list, status: 'fixed', updatedAt: 1, fixedAt: 1 };
    }
    function fill(rec, period, seed, base, upTo, goalList, skip) {
      var months = S.monthRange(period.startYm, period.endYm).filter(function (ym) { return ym < upTo; });
      months.forEach(function (ym, i) {
        if (skip && skip.indexOf(i) >= 0) return;
        var prog = {}; goalList.forEach(function (g, gi) { prog[g.id] = Math.min(100, 25 * (i + 1 + (gi % 2))); });
        addMonthly(rec, period, ym, scoresFor(rec.dept, seed + i, base, i), prog, 10 + i);
      });
    }
    var g1 = [{ id: 1, title: 'ソース充填機を一人で扱えるようになる', action: '週1回、先輩と一緒に段取りから洗浄までやる' },
              { id: 2, title: '先入先出のミスをゼロにする', action: '入庫のたびにロット表示を声に出して確認する' },
              { id: 3, title: 'アレルゲンの知識を身につける', action: '月に1品目ずつ原材料表示を調べてノートにまとめる' }];
    var hanako = staff[0];
    fill(hanako, prev, 100, 1.8, S.addMonths(prev.endYm, 1), g1);
    addGoals(hanako, prev, g1);
    var lastPrev = monthly[idOf(prev.endYm, hanako.email)];
    mgr[idOf(prev.id, hanako.email)] = { period: prev.id, email: hanako.email, dept: '製造部',
      scores: Object.keys(lastPrev.scores).reduce(function (o, k) { o[k] = Math.max(1, Math.min(4, lastPrev.scores[k] + (k % 5 === 0 ? -1 : 0))); return o; }, {}),
      comments: { 2: '検品が丁寧です' }, goalScores: { 1: 2, 2: 3, 3: 3 }, goalComments: { 1: '段取りまではできました。次は洗浄まで。' },
      overall: '毎月きちんと振り返りを続けられたのが何よりの力です。次は機械操作に挑戦しましょう。', released: true, reviewer: '福士', updatedAt: 9, releasedAt: 9 };
    var g2 = [{ id: 1, title: '真空包装機の設定を覚える', action: '設定表を見ながら、毎回自分で設定する' },
              { id: 2, title: '後輩に先入先出を教えられるようになる', action: '新人と一緒に月1回、棚の整理をする' }];
    addGoals(hanako, cur, g2); fill(hanako, cur, 200, 2.3, now, g2);
    var taro = staff[1];
    var g3 = [{ id: 1, title: 'ラインのリーダーを任される', action: '朝礼の進行を交代で担当する' }];
    addGoals(taro, cur, g3); fill(taro, cur, 300, 3.0, now, g3, [1]); // 2か月目は出し忘れ（さかのぼり不可のデモ用）
    var sakura = staff[2];
    var g4 = [{ id: 1, title: '新規のOEM問い合わせを月2件受ける', action: '展示会後3日以内にフォロー連絡をする' }];
    addGoals(sakura, cur, g4); fill(sakura, cur, 400, 2.7, now, g4);
    // 返信のデモ：花子さんの最新の提出には返信ずみ（未読）、桜さんは本人が書いた「ひとこと」あり・未返信
    var replies = {};
    function lastYmOf(rec, period) { var l = Object.keys(monthly).map(function (k) { return monthly[k]; }).filter(function (x) { return x.email === rec.email && x.period === period.id; }).map(function (x) { return x.ym; }).sort(); return l[l.length - 1]; }
    var hy = lastYmOf(hanako, cur), sy = lastYmOf(sakura, cur);
    if (hy) replies[idOf(hy, hanako.email)] = { ym: hy, period: cur.id, email: hanako.email, name: hanako.name, text: S.monthLabel(hy) + 'も、ていねいにふりかえってくれてありがとう。ロット確認がすっかり習慣になってきましたね。面談で、真空包装機のことも一緒に話しましょう🌷',
      seen: true, reviewer: '福士', createdAt: 20, updatedAt: 20 };
    if (sy) monthly[idOf(sy, sakura.email)].memo = '展示会のあとのフォロー連絡が、時間が足りずに遅れることがあります。相談させてください。';
    var suggestions = {};
    function sug(id, rec, cat, title, body, status, reply, pub, anon, t) {
      suggestions[id] = { id: id, email: rec.email, name: rec.name, dept: rec.dept, anonymous: !!anon, category: cat, title: title, body: body, status: status, reply: reply || '', public: !!pub, createdAt: t, updatedAt: t };
      if (reply) suggestions[id].repliedAt = t + 1;
    }
    sug('s-demo1', hanako, '仕事のやり方', '充填機の洗浄手順を写真つきにしたい', '新しく入った人が手順書だけだと迷いやすいので、洗浄の手順を写真つきで貼ると分かりやすいと思います。', 'adopted',
      'ありがとう！さっそく来月から、充填機のそばに写真つきの手順表を貼ります。撮影を手伝ってもらえますか？', true, false, 30);
    sug('s-demo2', taro, '設備・道具', '計量スプーンの置き場所がほしい', '計量スプーンがいつも別の場所にあって探す時間がもったいないです。', 'reading', '置き場所を相談してみますね。もう少しお待ちください。', false, false, 31);
    sug('s-demo3', staff[3], '職場の環境', '休憩室のイスを増やしたい', '昼休みにイスが足りない日があります。', 'new', '', false, false, 32);
    return { staff: staff, periods: [prev, cur], monthly: monthly, goals: goals, mgr: mgr, replies: replies, suggestions: suggestions };
  }

  function dload() {
    try { var s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) {}
    var d = seedDemo(); dsave(d); return d;
  }
  function dsave(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function vals(o) { return Object.keys(o).map(function (k) { return o[k]; }); }
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function curUser() { try { var s = sessionStorage.getItem(SESSION); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function isAdminEmail(d, email) { var s = d.staff.filter(function (x) { return x.email === email; })[0]; return !!s && s.role === 'admin'; }

  var dm = {
    init: async function () { dload(); },
    onAuth: function (cb) { authCbs.push(cb); setTimeout(function () { cb(curUser()); }, 0); },
    signIn: async function (email) {
      var u = { email: lower(email), verified: true };
      sessionStorage.setItem(SESSION, JSON.stringify(u)); authCbs.forEach(function (cb) { cb(u); });
    },
    signUp: async function () { throw new Error('デモモードでは新規登録できません'); },
    resendVerification: async function () {},
    refreshUser: async function () { return curUser(); },
    resetPassword: async function () {},
    signOut: async function () { sessionStorage.removeItem(SESSION); authCbs.forEach(function (cb) { cb(null); }); },
    resetDemo: function () { localStorage.removeItem(KEY); sessionStorage.removeItem(SESSION); },

    getStaff: async function (email) { return clone(dload().staff.filter(function (s) { return s.email === lower(email); })[0] || null); },
    listStaff: async function () { return clone(dload().staff); },
    saveStaff: async function (st) {
      var d = dload(), email = lower(st.email);
      d.staff = d.staff.filter(function (s) { return s.email !== email; });
      var depts = S.deptsOf(st);
      d.staff.push({ email: email, name: st.name || '', dept: depts[0] || '', depts: depts, certified: S.certifiedOf(st), role: st.role === 'admin' ? 'admin' : 'employee', active: st.active !== false });
      dsave(d);
    },
    listPeriods: async function () { return clone(dload().periods).sort(function (a, b) { return a.id < b.id ? 1 : -1; }); },
    savePeriod: async function (p) { var d = dload(); d.periods = d.periods.filter(function (x) { return x.id !== p.id; }); d.periods.push(clone(p)); dsave(d); },

    listMonthlyByEmail: async function (email) { return clone(vals(dload().monthly).filter(function (x) { return x.email === lower(email); })); },
    listMonthly: async function (period) { return clone(vals(dload().monthly).filter(function (x) { return x.period === period; })); },
    saveMonthly: async function (ym, email, data) {
      // 本番のFirestoreルールと同じ制限：今月分だけ・受付中の期間・提出済みは変更不可（管理者を除く）
      var d = dload(), u = curUser(), id = idOf(ym, email), old = d.monthly[id];
      if (!(u && isAdminEmail(d, u.email))) {
        var per = d.periods.filter(function (p) { return p.id === data.period; })[0];
        if (ym !== S.nowYm()) throw denied('今月以外は入力できません');
        if (!per || per.status !== 'open') throw denied('受付中の期間ではありません');
        if (old && old.status === 'submitted') throw denied('提出済みです');
      }
      d.monthly[id] = Object.assign(clone(data), { ym: ym, monthStart: S.ymStartMs(ym) }); dsave(d);
    },
    listGoalsByEmail: async function (email) { return clone(vals(dload().goals).filter(function (x) { return x.email === lower(email); })); },
    listGoals: async function (period) { return clone(vals(dload().goals).filter(function (x) { return x.period === period; })); },
    saveGoals: async function (period, email, data) {
      var d = dload(), u = curUser(), id = idOf(period, email), old = d.goals[id];
      if (!(u && isAdminEmail(d, u.email))) {
        var per = d.periods.filter(function (p) { return p.id === period; })[0];
        if (!per || per.status !== 'open') throw denied('受付中の期間ではありません');
        if (old && old.status === 'fixed') throw denied('確定済みの目標は変更できません');
      }
      d.goals[id] = clone(data); dsave(d);
    },
    listMgrReleasedByEmail: async function (email) { return clone(vals(dload().mgr).filter(function (x) { return x.email === lower(email) && x.released; })); },
    listMgr: async function (period) { return clone(vals(dload().mgr).filter(function (x) { return x.period === period; })); },
    saveMgr: async function (period, email, data) { var d = dload(); d.mgr[idOf(period, email)] = clone(data); dsave(d); },

    listRepliesByEmail: async function (email) { return clone(vals(dload().replies || {}).filter(function (x) { return x.email === lower(email); })); },
    listReplies: async function (period) { return clone(vals(dload().replies || {}).filter(function (x) { return x.period === period; })); },
    saveReply: async function (ym, email, data) {
      var d = dload(), u = curUser();
      if (!(u && isAdminEmail(d, u.email))) throw denied('返信は管理者だけが書けます');
      if (String(data.text || '').length > S.REPLY_MAX) throw denied('文字数が多すぎます');
      d.replies = d.replies || {}; d.replies[idOf(ym, email)] = clone(data); dsave(d);
    },
    markReplyRead: async function (ym, email) {
      var d = dload(), u = curUser(), id = idOf(ym, email);
      if (!u || u.email !== lower(email) || !d.replies || !d.replies[id]) throw denied('既読にできません');
      d.replies[id].readAt = Date.now(); dsave(d);
    },

    listSuggestionsMine: async function (email) { return clone(vals(dload().suggestions || {}).filter(function (x) { return x.email === lower(email); })); },
    listSuggestionsPublic: async function () { return clone(vals(dload().suggestions || {}).filter(function (x) { return x.public === true; })); },
    listSuggestions: async function () {
      var d = dload(), u = curUser(); if (!(u && isAdminEmail(d, u.email))) throw denied('管理者だけが全件を読めます');
      return clone(vals(d.suggestions || {}));
    },
    saveSuggestion: async function (id, data) {
      var d = dload(), u = curUser(), admin = !!(u && isAdminEmail(d, u.email)); d.suggestions = d.suggestions || {};
      var old = d.suggestions[id];
      if (!admin) {
        // 本人は新規投稿だけ（本番のルールと同じ）
        if (old) throw denied('投稿ずみの提案は変更できません');
        if (!u || data.email !== u.email || data.status !== 'new' || data.reply !== '' || data.public !== false) throw denied('投稿できません');
        if (S.SUG_CATS.indexOf(data.category) < 0 || !data.title || data.title.length > S.SUG_TITLE_MAX || !data.body || data.body.length > S.SUG_BODY_MAX) throw denied('入力内容が正しくありません');
      }
      d.suggestions[id] = clone(data); dsave(d);
    },
    deleteSuggestion: async function (id) {
      var d = dload(), u = curUser(), old = (d.suggestions || {})[id];
      if (!old) return;
      if (!(u && (isAdminEmail(d, u.email) || (old.email === u.email && old.status === 'new')))) throw denied('取り下げられません');
      delete d.suggestions[id]; dsave(d);
    }
  };

  var impl = demo ? dm : fb;
  Object.keys(impl).forEach(function (k) { Store[k] = impl[k]; });
  Store.idOf = idOf;
  window.Store = Store;
})();
