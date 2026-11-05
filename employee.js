/* 本人画面：月1回の自己評価・半年の目標・成長の見える化 */
(function () {
  var S = window.Scoring, UI = window.UI, Store = window.Store, esc = UI.esc;
  var app = document.getElementById('app');
  var st = {};
  var saveTimer = null, goalTimer = null;
  var TERM = function () { return S.TERM; };

  /* ---------------- データ参照 ---------------- */
  function periodObj(id) { return st.periods.filter(function (p) { return p.id === id; })[0]; }
  function byPeriod(list, p) { return (list || []).filter(function (x) { return x.period === p; })[0] || null; }
  function docsIn(period) { return st.monthly.filter(function (d) { return d.period === period.id; }); }
  function hasScores(d) { return d && Object.keys(d.scores || {}).some(function (k) { return S.isScored(d.scores[k]); }); }
  function latestDoc(period) {
    return docsIn(period).filter(hasScores).sort(function (a, b) { return a.ym < b.ym ? 1 : -1; })[0] || null;
  }
  function docBefore(ym) {
    return st.monthly.filter(function (d) { return d.ym < ym && hasScores(d); }).sort(function (a, b) { return a.ym < b.ym ? 1 : -1; })[0] || null;
  }
  function curPeriod() { return S.periodForYm(st.periods, st.nowYm); }
  function monthEditable() {
    var p = curPeriod();
    return !!p && p.status === 'open' && st.doc.status !== 'submitted';
  }
  function newMonthDoc() {
    return { ym: st.nowYm, period: (curPeriod() || {}).id || '', email: st.user.email, name: st.staff.name, dept: st.staff.dept,
      scores: {}, comments: {}, goalProgress: {}, goalNotes: {}, memo: '', status: 'draft', updatedAt: Date.now() };
  }
  function resetWorking() {
    var d = st.monthly.filter(function (x) { return x.ym === st.nowYm; })[0];
    st.doc = d ? JSON.parse(JSON.stringify(d)) : newMonthDoc();
    ['scores', 'comments', 'goalProgress', 'goalNotes'].forEach(function (k) { st.doc[k] = st.doc[k] || {}; });
    var g = byPeriod(st.goalsList, st.period);
    st.gdoc = g ? JSON.parse(JSON.stringify(g)) : { period: st.period, email: st.user.email, name: st.staff.name, dept: st.staff.dept, goals: [], status: 'draft', updatedAt: Date.now() };
  }
  function goalsFor(periodId) { var g = byPeriod(st.goalsList, periodId); return g ? g.goals || [] : []; }

  async function load() {
    st.nowYm = S.nowYm();
    st.periods = await Store.listPeriods();
    st.monthly = await Store.listMonthlyByEmail(st.user.email);
    st.goalsList = await Store.listGoalsByEmail(st.user.email);
    try { st.mgrList = await Store.listMgrReleasedByEmail(st.user.email); } catch (e) { st.mgrList = []; }
    try { st.replies = (await Store.listRepliesByEmail(st.user.email)).filter(function (r) { return r.text; }); } catch (e) { st.replies = []; }
    try { st.sugMine = await Store.listSuggestionsMine(st.user.email); } catch (e) { st.sugMine = []; }
    try { st.sugPub = await Store.listSuggestionsPublic(); } catch (e) { st.sugPub = []; }
    if (!st.period) st.period = ((curPeriod() || st.periods.filter(function (p) { return p.status === 'open'; })[0] || st.periods[0]) || {}).id || null;
    resetWorking();
  }

  /* ---------------- 枠組み ---------------- */
  function renderShell() {
    var demo = Store.mode === 'demo';
    app.innerHTML =
      (demo ? '<div class="demo-banner">🧪 デモモード（ダミーデータ・Firebase未接続）　今日＝' + esc(S.monthLabel(st.nowYm, true)) + ' <a href="#" id="reset-demo">デモをリセット</a></div>' : '') +
      '<header class="site-header"><div class="in"><span class="brand"><img class="logo" src="icons/logo.png" alt="" width="32" height="32"> ' + esc(window.APP_CONFIG.appName || '成長ノート') + '</span><span class="mode-chip">本人画面</span><span class="spacer"></span>' +
      '<div class="who">' + esc(st.staff.name) + ' さん<br><span style="opacity:.9">' + esc(S.deptLabel(st.staff) || '部署未設定') + '</span></div>' +
      (st.staff.role === 'admin' ? '<a href="admin.html">管理画面へ</a>' : '') + '<button class="link" id="logout">ログアウト</button></div></header>' +
      '<main class="wrap"><div id="prow" class="row" style="margin-bottom:8px"><label class="f" style="margin:0" for="psel">半年の期間</label>' +
      '<select id="psel" style="width:auto;min-width:200px">' + st.periods.map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (p.id === st.period ? ' selected' : '') + '>' + esc(p.label) + '（' + S.monthLabel(p.startYm) + '〜' + S.monthLabel(p.endYm) + '）' + (p.status === 'open' ? '' : '・終了') + '</option>';
      }).join('') + '</select></div>' +
      '<div class="tabs" id="tabs"><button class="tab" data-t="home">🌈 マイページ</button><button class="tab" data-t="form">✏️ 今月の自己評価</button><button class="tab" data-t="goals">🎯 半年の目標</button><button class="tab" data-t="history">📈 これまでの歩み</button><button class="tab" data-t="ideas">💡 提案ボックス</button></div>' +
      '<div id="view"></div></main><div id="dock-slot"></div>';
    document.getElementById('logout').onclick = function () { Store.signOut(); };
    var rd = document.getElementById('reset-demo'); if (rd) rd.onclick = function (e) { e.preventDefault(); Store.resetDemo(); location.reload(); };
    document.getElementById('psel').onchange = function (e) { flushAll(); st.period = e.target.value; resetWorking(); render(); };
    document.getElementById('tabs').onclick = function (e) { var b = e.target.closest('[data-t]'); if (b) { flushAll(); st.tab = b.dataset.t; render(); window.scrollTo(0, 0); } };
    // 日付をまたいで開きっぱなしだったら、最新の状態に読み込み直す
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && S.nowYm() !== st.nowYm) { UI.toast('月が変わりました。読み込み直します'); setTimeout(function () { location.reload(); }, 1200); }
    });
  }

  /** やさしいあいさつのカード（時間帯・季節・その日のひとこと） */
  function certChip() {
    var c = S.certifiedOf(st.staff), t = S.certTitle(c.length, Object.keys(window.COMPETENCY_ITEMS).length);
    return t ? '<div class="cert-chip" title="' + esc(c.join('・')) + '">' + t.emoji + ' ' + esc(t.name) + '<span>' + esc(c.join('・')) + '</span></div>' : '';
  }
  function greetCard() {
    var g = S.greeting(), nm = S.givenName(st.staff.name) || st.staff.name;
    return '<div class="greet"><div class="gr-l"><div class="gr-hi">' + esc(g.text) + ' ' + g.icon + '</div><div class="gr-name">' + esc(nm) + ' さん</div>' +
      certChip() + '<div class="gr-msg">' + esc(S.dailyMessage()) + '</div></div><div class="gr-art" aria-hidden="true">' + S.seasonEmoji() + '</div></div>';
  }
  function repliesSorted() { return st.replies.slice().sort(function (a, b) { return a.ym < b.ym ? 1 : -1; }); }
  /** 管理者からのひとこと。未読があれば全部、なければ最新の1通 */
  function letterCards() {
    var list = repliesSorted(); if (!list.length) return '';
    var unread = list.filter(function (r) { return !r.readAt; }), show = unread.length ? unread : [list[0]];
    return show.map(function (r) {
      var isNew = !r.readAt;
      return '<div class="card letter' + (isNew ? ' new' : '') + '"><div class="lt-h"><span class="lt-ic">💌</span><b>' + esc(r.reviewer || '上司') + ' さんからのひとこと</b><span class="chip">' + S.monthLabel(r.ym) + '分</span>' + (isNew ? '<span class="newtag">NEW</span>' : '') + '</div>' +
        '<p class="lt-b">' + esc(r.text) + '</p></div>';
    }).join('');
  }
  /** 開いたら既読にする（失敗しても画面はそのまま） */
  function markRead() {
    st.replies.filter(function (r) { return !r.readAt; }).forEach(function (r) {
      Store.markReplyRead(r.ym, st.user.email).then(function () { r.readAt = Date.now(); }, function () {});
    });
  }

  function monthBanner() {
    var cp = curPeriod(), d = st.monthly.filter(function (x) { return x.ym === st.nowYm; })[0];
    var left = S.daysLeftInMonth(S.nowMs()), label = S.monthLabel(st.nowYm), last = S.monthLabel(st.nowYm) + S.lastDay(st.nowYm) + '日';
    var status = S.monthStatus(st.nowYm, st.nowYm, d);
    if (!cp) return '<div class="card"><b>' + label + '</b>は評価期間が設定されていません。管理者が期間を作ると、毎月の自己評価ができます。</div>';
    if (status === 'submitted') return '<div class="card" style="background:#e9f7ef"><b>✅ ' + label + 'の自己評価は提出ずみです。</b> おつかれさまでした！ 来月もまた、月初から入力できます。</div>';
    return '<div class="card" style="background:linear-gradient(135deg,#fff,#fff0d9)"><div class="row"><div style="flex:1;min-width:200px"><b>✏️ ' + label + 'の自己評価（' + (status === 'draft' ? '入力中' : 'まだ') + '）</b><div class="small muted">' + last + 'まで入力できます（あと' + left + '日）。<b>月がかわると、その月分はさかのぼって入力できません。</b></div></div>' +
      (st.tab !== 'form' && cp.status === 'open' ? '<button class="btn" id="go-form">今月の自己評価へ</button>' : '') + '</div></div>';
  }

  function render() {
    document.querySelectorAll('#tabs .tab').forEach(function (b) { b.classList.toggle('on', b.dataset.t === (st.tab || 'home')); });
    document.getElementById('prow').style.display = (st.tab === 'form' || st.tab === 'ideas') ? 'none' : '';
    document.getElementById('dock-slot').innerHTML = '';
    var vw = document.getElementById('view'); vw.onclick = null; vw.oninput = null;
    if (st.tab === 'ideas') { renderIdeas(); return; }
    if (!st.items.length) { vw.innerHTML = '<div class="card">あなたの部署（' + esc(S.deptLabel(st.staff) || '未設定') + '）の評価表がまだありません。管理者にご確認ください。</div>'; return; }
    if (!st.periods.length) { vw.innerHTML = '<div class="card">評価期間がまだ作られていません。管理者が期間を作成すると、ここから始められます。</div>'; return; }
    ({ home: renderHome, form: renderForm, goals: renderGoals, history: renderHistory }[st.tab || 'home'])();
    var gf = document.getElementById('go-form'); if (gf) gf.onclick = function () { st.tab = 'form'; render(); window.scrollTo(0, 0); };
  }

  /* ---------------- マイページ ---------------- */
  function monthChips(period) {
    var months = S.monthRange(period.startYm, period.endYm);
    return '<div class="months">' + months.map(function (ym) {
      var d = st.monthly.filter(function (x) { return x.ym === ym; })[0], s = S.monthStatus(ym, st.nowYm, d);
      var icon = { submitted: '✅', draft: '📝', current: '✏️', missed: '⚠️', future: '🔒' }[s];
      var txt = { submitted: '提出ずみ', draft: '入力中', current: '今月', missed: '未提出', future: 'これから' }[s];
      var hasRep = st.replies.some(function (r) { return r.ym === ym; });
      return '<div class="mchip ' + s + '"><div class="mm">' + S.monthLabel(ym) + '</div><div class="ic">' + icon + '</div><div class="tx">' + txt + (hasRep ? ' 💌' : '') + '</div></div>';
    }).join('') + '</div>';
  }

  function renderHome() {
    var view = document.getElementById('view'), items = st.items, period = periodObj(st.period);
    var mgr = byPeriod(st.mgrList, st.period), ld = latestDoc(period), goals = goalsFor(st.period);
    var submittedMap = {}; st.monthly.forEach(function (d) { submittedMap[d.ym] = d; });
    var streak = S.streak(submittedMap, st.nowYm);
    var due = S.monthRange(period.startYm, period.endYm).filter(function (ym) { return ym < st.nowYm || (ym === st.nowYm && submittedMap[ym] && submittedMap[ym].status === 'submitted'); });
    var perfect = due.length >= 2 && due.every(function (ym) { return submittedMap[ym] && submittedMap[ym].status === 'submitted'; });
    var html = greetCard() + letterCards() + ideaHomeCards() + monthBanner();

    html += '<div class="card"><h2>📅 ' + esc(period.label) + ' の毎月の自己評価</h2>' + monthChips(period) +
      '<p class="small muted" style="margin:8px 0 0">' + (streak >= 2 ? '🔥 ' + streak + 'か月連続で提出中です！　' : '') + '毎月、その月のうちに入力します。出し忘れた月は、あとから入力できません。</p></div>';

    if (!ld && !mgr) {
      markRead();
      view.innerHTML = html + '<div class="card" style="text-align:center"><div style="font-size:4rem">' + S.STAGES[0].emoji + '</div><h2>さあ、はじめましょう</h2><p class="muted">できていること・これから伸ばしたいことを、月に1回ふりかえります。<br>入力するほど、あなたの「' + esc(TERM()) + '」が育っていきます。</p></div>';
      return bind();
    }
    var main = mgr ? mgr.scores : ld.scores;
    var avg = S.average(items, main), cnt = S.progress(items, main).scored;
    var prev = ld ? docBefore(ld.ym) : null;
    var stats = S.categoryStats(items, main), prevStats = (!mgr && prev) ? S.categoryStats(items, prev.scores) : null;
    var stg = S.stageFor(avg) || S.STAGES[0];

    html += '<div class="card">' + UI.stageHero(avg, cnt, mgr ? '上司の評価をふまえた、いまの' + TERM() : (ld ? S.monthLabel(ld.ym) + 'の自己評価での、いまの' + TERM() : ''));
    if (mgr && ld) {
      var sAvg = S.average(items, ld.scores), ss = S.stageFor(sAvg);
      if (ss) html += '<p class="small muted" style="margin:8px 0 0">自己評価（' + S.monthLabel(ld.ym) + '）では ' + ss.emoji + ' ' + esc(ss.title) + '（平均 ' + sAvg.toFixed(2) + '）、上司の評価では ' + stg.emoji + ' ' + esc(stg.title) + '（平均 ' + avg.toFixed(2) + '）でした。</p>';
    } else if (!mgr) {
      html += '<p class="small muted" style="margin:8px 0 0">半年の終わりに上司の評価が公開されると、ここが「上司の評価をふまえた' + esc(TERM()) + '」に変わります。</p>';
    }
    html += UI.stagePath(stg.id) + '</div>';

    if (prev && ld && !mgr) {
      var pavg = S.average(items, prev.scores), d = pavg == null ? null : avg - pavg, imp = S.improvedItems(items, ld.scores, prev.scores);
      if (d != null) html += '<div class="card" style="background:linear-gradient(135deg,#fff,#fff4e0)"><h2>' + (d > 0.04 ? '🚀 先月より、成長しています！' : '前回とくらべて') + '</h2><p style="margin:0">' + S.monthLabel(prev.ym) + 'の平均 <b>' + pavg.toFixed(2) + '</b> → ' + S.monthLabel(ld.ym) + ' <b>' + avg.toFixed(2) + '</b>　<span class="' + (d >= 0 ? 'gap-up' : 'gap-down') + '">' + (d >= 0 ? '▲ +' : '▼ ') + d.toFixed(2) + '</span>' +
        (imp.length ? '<br>点数が上がった項目：<b>' + imp.length + '個</b>（' + imp.slice(0, 4).map(function (i) { return esc(i.name); }).join('、') + (imp.length > 4 ? ' ほか' : '') + '）' : '') + '</p></div>';
    }

    html += '<div class="grid2" style="margin-bottom:16px"><div class="card"><h2>📊 力量区分ごとの伸び</h2>' + UI.categoryBars(stats, prevStats) + '</div>' +
      '<div class="card"><h2>🕸 得意のバランス</h2>' + UI.radar(stats.map(function (c) { return c.cat; }), (function () {
        var arr = [];
        if (ld) arr.push({ label: S.monthLabel(ld.ym) + 'の自己評価', color: '#ee6f8f', values: S.categoryStats(items, ld.scores).map(function (c) { return c.avg; }) });
        if (mgr) arr.push({ label: '上司の評価', color: '#2f8f9d', values: stats.map(function (c) { return c.avg; }) });
        if (prevStats) arr.push({ label: S.monthLabel(prev.ym), color: '#b8a9a9', dash: true, values: prevStats.map(function (c) { return c.avg; }) });
        return arr;
      })()) + '</div></div>';

    if (goals.length) html += '<div class="card"><h2>🎯 半年の目標の進み具合</h2>' + goalSummary(period, goals, mgr) + '<p style="margin:10px 0 0"><button class="btn sub small" id="go-goals">目標のページへ</button></p></div>';

    var bd = S.badges(items, main, prev ? prev.scores : null, { streak: streak, perfect: perfect });
    if (bd.length) html += '<div class="card"><h2>🎖 もらったバッジ</h2><div class="badges">' + bd.map(function (b) {
      return '<div class="badge"><span class="e">' + b.emoji + '</span><div><b>' + esc(b.name) + '</b><span>' + esc(b.note) + '</span></div></div>';
    }).join('') + '</div></div>';

    if (mgr) {
      var self = ld ? ld.scores : {}, g = S.gaps(items, self, mgr.scores), up = [], down = [];
      items.forEach(function (it) { if (g[it.no] > 0) up.push(it); else if (g[it.no] < 0) down.push(it); });
      html += '<div class="card mgr-msg"><h2>💌 上司からのメッセージ</h2><p style="white-space:pre-wrap;margin:0">' + esc(mgr.overall || '（コメントはありません）') + '</p></div>';
      if (up.length || down.length) {
        html += '<div class="card"><h2>🔍 自己評価と上司の評価のちがい</h2>' +
          (up.length ? '<p><b>上司はもっと高く見ています（自信をもって大丈夫）</b><br>' + up.slice(0, 8).map(function (i) { return '<span class="chip ok" style="margin:2px">' + esc(i.name) + '</span>'; }).join('') + '</p>' : '') +
          (down.length ? '<p><b>一緒に確認したい項目</b><br>' + down.slice(0, 8).map(function (i) { return '<span class="chip warn" style="margin:2px">' + esc(i.name) + '</span>'; }).join('') + '</p>' : '') + '</div>';
      }
    }
    view.innerHTML = html;
    markRead();
    bind();
    if (mgr && !sessionStorage.getItem('ce-celebrated-' + st.period + st.user.email)) {
      sessionStorage.setItem('ce-celebrated-' + st.period + st.user.email, '1');
      celebrate('上司の評価が届きました！', avg);
    }
    function bind() {
      var b = document.getElementById('go-goals'); if (b) b.onclick = function () { st.tab = 'goals'; render(); window.scrollTo(0, 0); };
      view.querySelectorAll('[data-toideas]').forEach(function (x) { x.onclick = function () { st.tab = 'ideas'; render(); window.scrollTo(0, 0); }; });
    }
  }

  /** 目標ごとの月別の進み具合 + 上司の達成度 */
  function goalSummary(period, goals, mgr) {
    var months = S.monthRange(period.startYm, period.endYm);
    return goals.map(function (g) {
      var lp = S.latestGoalProgress(g.id, docsIn(period)), v = lp ? lp.v : 0;
      var dots = months.map(function (ym) {
        var d = st.monthly.filter(function (x) { return x.ym === ym; })[0], pv = d && d.goalProgress ? d.goalProgress[g.id] : undefined;
        return '<span class="gdot" title="' + S.monthLabel(ym) + '">' + S.monthLabel(ym) + '<b>' + (typeof pv === 'number' ? pv + '%' : '–') + '</b></span>';
      }).join('');
      var res = mgr && mgr.goalScores && mgr.goalScores[g.id] ? '<div class="msg info small" style="margin:8px 0 0">👤 上司の評価：<b>' + esc(S.GOAL_LEVELS[mgr.goalScores[g.id] - 1].name) + '</b>' + (mgr.goalComments && mgr.goalComments[g.id] ? '　「' + esc(mgr.goalComments[g.id]) + '」' : '') + '</div>' : '';
      return '<div class="goal"><div class="row"><b style="flex:1">' + esc(g.title) + '</b><span class="chip">' + v + '%</span></div>' +
        (g.action ? '<div class="small muted">やること：' + esc(g.action) + '</div>' : '') + '<div class="bar" style="margin:6px 0"><i style="width:' + v + '%"></i></div><div class="gdots">' + dots + '</div>' + res + '</div>';
    }).join('');
  }

  function celebrate(title, avg) {
    var s = S.stageFor(avg); if (!s) return;
    UI.confetti();
    UI.modal('<div class="big">' + s.emoji + '</div><h2>' + esc(title) + '</h2><p>いまの' + esc(TERM()) + 'は <b style="color:' + s.color + ';font-size:1.3rem">' + esc(s.title) + '</b></p><p class="muted">' + esc(s.msg) + '</p><button class="btn" data-close>ありがとう！</button>');
  }

  /* ---------------- 今月の自己評価フォーム ---------------- */
  function renderForm() {
    var view = document.getElementById('view'), items = st.items, doc = st.doc, cp = curPeriod();
    var ed = monthEditable(), goals = cp ? goalsFor(cp.id) : [];
    var html = monthBanner();
    if (!cp) { view.innerHTML = html; return; }
    if (cp.status !== 'open') html += '<div class="msg info">この期間は受付が終了しています。</div>';

    html += '<div class="card"><h2>✏️ ' + esc(S.monthLabel(st.nowYm, true)) + 'の力量評価（' + esc(S.deptLabel(st.staff)) + '）</h2>' +
      '<p class="muted" style="margin:0">今の自分に一番近いものを選んでください。正解はありません。「できるようになったこと」を見つけるつもりで、ゆっくりどうぞ。</p>' +
      '<details style="margin-top:10px"><summary style="cursor:pointer;color:var(--pri-d);font-weight:700">評価の基準を見る</summary><div style="margin-top:8px">' +
      S.LEVELS.map(function (l) { return '<p style="margin:6px 0"><b>' + l.mark + ' ' + l.name + '（' + l.score + '点）</b>：' + esc(l.short) + '<br><span class="muted small">' + esc(l.original) + '</span></p>'; }).join('') +
      '<p class="small muted">どれにも当てはまらない（自分の仕事ではない）項目は「対象外」を選べます。</p></div></details>' +
      '<p class="small muted" style="margin:10px 0 0">評価表の項目や基準について、意見や疑問があるときは <a href="#" data-toideas>💡 提案ボックス</a> に書いてください。</p>' +
      (ed ? '<p style="margin:10px 0 0"><button class="btn sub small" id="copy-prev">先月の点数を引き継ぐ（未入力の項目だけ）</button></p>' : '') + '</div>';

    // 目標の進み具合
    if (goals.length) {
      html += '<div class="card"><h2>🎯 半年の目標の進み具合</h2><p class="muted small" style="margin-top:0">今月は、どこまで進みましたか？</p>' + goals.map(function (g) {
        var v = doc.goalProgress[g.id], note = doc.goalNotes[g.id] || '';
        return '<div class="goal" data-gid="' + g.id + '"><b>' + esc(g.title) + '</b>' + (g.action ? '<div class="small muted">やること：' + esc(g.action) + '</div>' : '') +
          '<div class="gp">' + S.GOAL_PROGRESS.map(function (o) {
            return '<button type="button" data-v="' + o.v + '" class="' + (v === o.v ? 'on' : '') + '"' + (ed ? '' : ' disabled') + '><span class="mk">' + o.v + '%</span><span class="nm">' + o.label + '</span></button>';
          }).join('') + '</div>' +
          (ed || note ? '<textarea data-gnote placeholder="進んだこと・つまずいていること（任意）"' + (ed ? '' : ' readonly') + ' style="margin-top:6px">' + esc(note) + '</textarea>' : '') + '</div>';
      }).join('') + '</div>';
    } else {
      html += '<div class="card"><b>🎯 半年の目標がまだありません。</b><div class="muted small">目標を決めると、毎月の進み具合もここで記録できます。</div><p style="margin:8px 0 0"><button class="btn sub small" id="to-goals">目標を決める</button></p></div>';
    }

    var cats = [], map = {};
    items.forEach(function (it) { if (!map[it.cat]) { map[it.cat] = []; cats.push(it.cat); } map[it.cat].push(it); });
    cats.forEach(function (c, ci) {
      html += '<details class="cat"' + (ci === 0 || !ed ? ' open' : '') + ' data-cat="' + esc(c) + '"><summary>' + esc(c) + '<span class="cnt" data-cnt></span></summary>' +
        map[c].map(function (it) {
          var v = doc.scores[it.no], cm = doc.comments[it.no] || '';
          return '<div class="item" data-no="' + it.no + '"><div><span class="no">' + (it.dispNo || it.no) + '</span><span class="ttl">' + esc(it.name) + '</span></div>' +
            '<div class="crit">' + esc(it.criteria) + '</div>' +
            '<div class="lv">' + S.LEVELS.map(function (l) {
              return '<button type="button" data-s="' + l.score + '" class="' + (v === l.score ? 'on' : '') + '"' + (ed ? '' : ' disabled') + ' title="' + esc(l.short) + '"><span class="mk">' + l.mark + '</span><span class="nm">' + l.name + '</span></button>';
            }).join('') + '<button type="button" class="na ' + (v === 0 ? 'on' : '') + '" data-s="0"' + (ed ? '' : ' disabled') + '>対象外</button></div>' +
            '<div class="lv-help" data-help>' + (v >= 1 ? esc(S.LEVELS[v - 1].short) : '') + '</div>' +
            (ed || cm ? '<button type="button" class="cm-toggle" data-cm>' + (cm ? '💬 コメント' : '💬 コメントを書く（できるようになったこと・困っていること）') + '</button>' +
              '<textarea class="' + (cm ? '' : 'hidden') + '" data-cmt placeholder="例）先月から一人で任されるようになりました"' + (ed ? '' : ' readonly') + '>' + esc(cm) + '</textarea>' : '') + '</div>';
        }).join('') + '</details>';
    });
    html += '<div class="card"><h2>📝 今月のひとこと（任意）</h2><textarea id="memo" placeholder="今月がんばったこと、気づいたこと、相談したいこと"' + (ed ? '' : ' readonly') + '>' + esc(doc.memo || '') + '</textarea></div>';
    view.innerHTML = html;

    var tg = document.getElementById('to-goals'); if (tg) tg.onclick = function () { st.tab = 'goals'; render(); };
    var ti = view.querySelector('[data-toideas]'); if (ti) ti.onclick = function (e) { e.preventDefault(); flushAll(); st.tab = 'ideas'; render(); window.scrollTo(0, 0); };
    if (ed) {
      view.onclick = function (e) {
        var gp = e.target.closest('.gp button');
        if (gp && !gp.disabled) {
          var ge = gp.closest('.goal'); doc.goalProgress[ge.dataset.gid] = Number(gp.dataset.v);
          ge.querySelectorAll('.gp button').forEach(function (x) { x.classList.toggle('on', x === gp); });
          queueSave(); updateProgress(); return;
        }
        var b = e.target.closest('.lv button');
        if (b && !b.disabled) {
          var itemEl = b.closest('.item'), no = itemEl.dataset.no, s = Number(b.dataset.s);
          doc.scores[no] = s;
          itemEl.querySelectorAll('.lv button').forEach(function (x) { x.classList.toggle('on', x === b); });
          itemEl.querySelector('[data-help]').textContent = s >= 1 ? S.LEVELS[s - 1].short : '';
          queueSave(); updateProgress(); return;
        }
        var t = e.target.closest('[data-cm]');
        if (t) { var ta = t.nextElementSibling; ta.classList.toggle('hidden'); if (!ta.classList.contains('hidden')) ta.focus(); }
      };
      view.oninput = function (e) {
        var ta = e.target;
        if (ta.matches('[data-cmt]')) doc.comments[ta.closest('.item').dataset.no] = ta.value;
        else if (ta.matches('[data-gnote]')) doc.goalNotes[ta.closest('.goal').dataset.gid] = ta.value;
        else if (ta.id === 'memo') doc.memo = ta.value; else return;
        queueSave();
      };
      var cpb = document.getElementById('copy-prev');
      if (cpb) cpb.onclick = function () {
        var pv = docBefore(st.nowYm); if (!pv) return UI.toast('引き継げる先月のデータがありません');
        var n = 0; items.forEach(function (it) { if (doc.scores[it.no] == null && pv.scores[it.no] != null) { doc.scores[it.no] = pv.scores[it.no]; n++; } });
        queueSave(); renderForm(); UI.toast(n + '項目を引き継ぎました。今月の状態に合わせて見直してください');
      };
    }
    var dock = document.getElementById('dock-slot');
    dock.innerHTML = '<div class="dock"><div class="in"><div style="flex:1;min-width:140px"><div class="small"><b id="pg-t"></b></div><div class="bar"><i id="pg-b" style="width:0"></i></div></div><span class="save-st" id="save-st"></span>' +
      (ed ? '<button class="btn" id="submit">今月分を提出する</button>' : '') + '</div></div>';
    var sub = document.getElementById('submit'); if (sub) sub.onclick = submit;
    updateProgress();
  }

  function goalsAnswered() {
    var cp = curPeriod(), goals = cp ? goalsFor(cp.id) : [];
    return { total: goals.length, answered: goals.filter(function (g) { return typeof st.doc.goalProgress[g.id] === 'number'; }).length };
  }
  function updateProgress() {
    var p = S.progress(st.items, st.doc.scores), gp = goalsAnswered(), pt = document.getElementById('pg-t');
    if (!pt) return;
    var all = p.answered + gp.answered, tot = p.total + gp.total;
    pt.textContent = '入力 ' + all + ' / ' + tot + (all === tot ? '　🎉 ぜんぶ入力できました！' : '');
    document.getElementById('pg-b').style.width = Math.round(all / Math.max(1, tot) * 100) + '%';
    document.querySelectorAll('details.cat').forEach(function (d) {
      var its = st.items.filter(function (i) { return i.cat === d.dataset.cat; }), q = S.progress(its, st.doc.scores);
      d.querySelector('[data-cnt]').textContent = q.answered + '/' + q.total + (q.answered === q.total ? ' ✅' : '');
    });
    document.querySelectorAll('.item').forEach(function (el) { el.classList.toggle('done', st.doc.scores[el.dataset.no] != null); });
  }

  /* ---------------- 保存・提出（月次） ---------------- */
  function payload(status) {
    var d = st.doc, out = { ym: st.nowYm, period: (curPeriod() || {}).id, email: st.user.email, name: st.staff.name, dept: st.staff.dept,
      scores: d.scores, comments: d.comments, goalProgress: d.goalProgress, goalNotes: d.goalNotes, memo: d.memo || '',
      status: status || d.status || 'draft', updatedAt: Date.now() };
    if (out.status === 'submitted') out.submittedAt = d.submittedAt || Date.now();
    return out;
  }
  function setSaveState(t) { var el = document.getElementById('save-st'); if (el) el.textContent = t; }
  function queueSave() { setSaveState('保存中…'); clearTimeout(saveTimer); saveTimer = setTimeout(function () { save(); }, 700); }
  function flushAll() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; if (monthEditable() && st.tab === 'form') save(); }
    if (goalTimer) { clearTimeout(goalTimer); goalTimer = null; saveGoals(); }
  }
  async function save(status) {
    clearTimeout(saveTimer); saveTimer = null;
    var data = payload(status);
    try {
      await Store.saveMonthly(st.nowYm, st.user.email, data);
      data.monthStart = S.ymStartMs(st.nowYm);
      st.doc = Object.assign(st.doc, data);
      var i = st.monthly.findIndex(function (x) { return x.ym === st.nowYm; });
      var copy = JSON.parse(JSON.stringify(st.doc)); if (i >= 0) st.monthly[i] = copy; else st.monthly.push(copy);
      setSaveState('✓ 保存しました'); return true;
    } catch (e) { setSaveState('⚠ 保存できませんでした'); UI.toast(window.AuthUI.errText(e)); return false; }
  }
  function submit() {
    var p = S.progress(st.items, st.doc.scores), gp = goalsAnswered();
    if (p.answered < p.total || gp.answered < gp.total) {
      UI.toast('あと ' + (p.total - p.answered + gp.total - gp.answered) + '項目 未入力です');
      var el = null;
      if (gp.answered < gp.total) el = document.querySelector('.goal[data-gid="' + goalsFor(curPeriod().id).filter(function (g) { return typeof st.doc.goalProgress[g.id] !== 'number'; })[0].id + '"]');
      else { var first = st.items.filter(function (i) { return st.doc.scores[i.no] == null; })[0]; el = document.querySelector('.item[data-no="' + first.no + '"]'); if (el) el.closest('details').open = true; }
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var avg = S.average(st.items, st.doc.scores), s = S.stageFor(avg);
    var m = UI.modal('<div class="big">' + (s ? s.emoji : '📝') + '</div><h2>' + esc(S.monthLabel(st.nowYm)) + '分を提出しますか？</h2><p class="muted">提出すると、今月分は直せなくなります。<br>（月がかわると、この月分はさかのぼって入力・提出できません）<br>上司から「💌 ひとこと」が届くと、マイページでお知らせします。</p><div class="row" style="justify-content:center"><button class="btn gray" data-close>もう少し見直す</button><button class="btn" id="ok">提出する</button></div>');
    m.el.querySelector('#ok').onclick = async function () {
      this.disabled = true;
      if (await save('submitted')) { m.close(); st.tab = 'home'; render(); celebrate(S.monthLabel(st.nowYm) + '分、提出ありがとうございました！', avg); }
      else this.disabled = false;
    };
  }

  /* ---------------- 半年の目標 ---------------- */
  function goalsEditable() { var p = periodObj(st.period); return !!p && p.status === 'open' && st.gdoc.status !== 'fixed'; }

  function renderGoals() {
    var view = document.getElementById('view'), period = periodObj(st.period), g = st.gdoc, ed = goalsEditable();
    var html = '<div class="card"><h2>🎯 ' + esc(period.label) + ' の目標</h2>' +
      '<p class="muted" style="margin:0">半年に1度、自分の目標を決めます（' + S.MAX_GOALS + 'つまで）。毎月の自己評価のときに、進み具合を記録できます。</p>' +
      '<details style="margin-top:8px"><summary style="cursor:pointer;color:var(--pri-d);font-weight:700">目標の立て方のヒント</summary><ul class="small muted" style="margin:6px 0"><li>「いつまでに・何が・どうなっている」かが分かる形にすると、進み具合を測りやすくなります。</li><li>評価表の項目（力量）から「◯◯を△から〇にする」と選ぶのもおすすめです。</li><li>「やること」には、毎月続けられる小さな行動を書きましょう。</li></ul></details></div>';

    if (g.status === 'fixed') {
      var mgr = byPeriod(st.mgrList, st.period);
      html += '<div class="card"><div class="row"><span class="chip ok">確定ずみ</span><span class="muted small">確定した目標は、本人は変更できません（変更したいときは管理者に相談）。</span></div>' + goalSummary(period, g.goals, mgr) + '</div>';
      view.innerHTML = html; return;
    }
    if (!ed) { html += '<div class="card">この期間は受付が終了しています。' + (g.goals.length ? '' : '目標は設定されませんでした。') + '</div>' + (g.goals.length ? '<div class="card">' + goalSummary(period, g.goals, byPeriod(st.mgrList, st.period)) + '</div>' : ''); view.innerHTML = html; return; }

    html += '<div id="glist">' + g.goals.map(goalRow).join('') + '</div>' +
      '<div class="card"><div class="row"><button class="btn sub small" id="gadd"' + (g.goals.length >= S.MAX_GOALS ? ' disabled' : '') + '>＋ 目標を追加</button><span class="spacer"></span><span class="save-st" id="gsave"></span><button class="btn" id="gfix">この目標で確定する</button></div></div>';
    view.innerHTML = html;
    if (!g.goals.length) addGoalRow();
    var vw = document.getElementById('view');
    vw.oninput = function (e) {
      var row = e.target.closest('.goal-edit'); if (!row) return;
      var goal = g.goals.filter(function (x) { return String(x.id) === row.dataset.gid; })[0];
      if (e.target.matches('[data-gt]')) goal.title = e.target.value; else if (e.target.matches('[data-ga]')) goal.action = e.target.value;
      queueGoals();
    };
    vw.onclick = function (e) {
      if (e.target.closest('#gadd')) return addGoalRow();
      var rm = e.target.closest('[data-grm]');
      if (rm) { g.goals = g.goals.filter(function (x) { return String(x.id) !== rm.dataset.grm; }); queueGoals(); renderGoals(); return; }
      if (e.target.closest('#gfix')) fixGoals();
    };
  }
  function goalRow(x, i) {
    return '<div class="card goal-edit" data-gid="' + x.id + '"><div class="row"><b>目標 ' + (i + 1) + '</b><span class="spacer"></span><button class="btn gray small" data-grm="' + x.id + '">削除</button></div>' +
      '<label class="f">目標（何を、どうしたい？）</label><input type="text" data-gt value="' + esc(x.title || '') + '" placeholder="例）ソース充填機を一人で扱えるようになる" maxlength="80">' +
      '<label class="f">そのために毎月やること</label><input type="text" data-ga value="' + esc(x.action || '') + '" placeholder="例）週1回、先輩と一緒に段取りから洗浄までやる" maxlength="120"></div>';
  }
  function addGoalRow() {
    var g = st.gdoc; if (g.goals.length >= S.MAX_GOALS) return;
    var id = g.goals.reduce(function (m, x) { return Math.max(m, x.id); }, 0) + 1;
    g.goals.push({ id: id, title: '', action: '' });
    if (document.getElementById('glist') && g.goals.length > 1) { renderGoals(); var inputs = document.querySelectorAll('[data-gt]'); inputs[inputs.length - 1].focus(); }
    else if (document.getElementById('glist')) document.getElementById('glist').innerHTML = g.goals.map(goalRow).join('');
  }
  function queueGoals() { var el = document.getElementById('gsave'); if (el) el.textContent = '保存中…'; clearTimeout(goalTimer); goalTimer = setTimeout(function () { saveGoals(); }, 800); }
  async function saveGoals(status) {
    clearTimeout(goalTimer); goalTimer = null;
    var g = st.gdoc, data = { period: st.period, email: st.user.email, name: st.staff.name, dept: st.staff.dept,
      goals: g.goals.filter(function (x) { return (x.title || '').trim() || (x.action || '').trim(); }), status: status || g.status || 'draft', updatedAt: Date.now() };
    if (data.status === 'fixed') data.fixedAt = Date.now();
    try {
      await Store.saveGoals(st.period, st.user.email, data);
      var i = st.goalsList.findIndex(function (x) { return x.period === st.period; });
      if (i >= 0) st.goalsList[i] = data; else st.goalsList.push(data);
      st.gdoc.status = data.status; var el = document.getElementById('gsave'); if (el) el.textContent = '✓ 保存しました'; return true;
    } catch (e) { var el2 = document.getElementById('gsave'); if (el2) el2.textContent = '⚠ 保存できませんでした'; UI.toast(window.AuthUI.errText(e)); return false; }
  }
  function fixGoals() {
    var g = st.gdoc, list = g.goals.filter(function (x) { return (x.title || '').trim(); });
    if (!list.length) return UI.toast('目標を1つ以上、入力してください');
    var m = UI.modal('<div class="big">🎯</div><h2>この目標で確定しますか？</h2><p class="muted">確定すると、目標は自分では変更できなくなります。<br>（毎月の進み具合は、これまでどおり記録できます）</p><div class="row" style="justify-content:center"><button class="btn gray" data-close>見直す</button><button class="btn" id="ok">確定する</button></div>');
    m.el.querySelector('#ok').onclick = async function () {
      this.disabled = true; g.goals = list;
      if (await saveGoals('fixed')) { m.close(); UI.confetti(); UI.toast('目標を確定しました。毎月の進み具合を記録していきましょう'); renderGoals(); }
      else this.disabled = false;
    };
  }

  /* ---------------- 提案ボックス ---------------- */
  var seenKey = function () { return 'ce-sug-seen-' + st.user.email; };
  function seenMap() { try { return JSON.parse(localStorage.getItem(seenKey()) || '{}'); } catch (e) { return {}; } }
  function markSugSeen() {
    var m = seenMap(); st.sugMine.forEach(function (x) { if (x.repliedAt) m[x.id] = x.repliedAt; });
    try { localStorage.setItem(seenKey(), JSON.stringify(m)); } catch (e) {}
  }
  function unseenReplies() { var m = seenMap(); return st.sugMine.filter(function (x) { return x.reply && x.repliedAt && m[x.id] !== x.repliedAt; }); }
  function sugBadge(x) { var s = S.sugStatus(x.status); return '<span class="chip ' + s.cls + '">' + s.emoji + ' ' + esc(s.name) + '</span>'; }
  function byNewest(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }
  function whoOf(x) { return x.anonymous ? '' : esc(S.givenName(x.name)) + ' さんの提案'; }
  function wonList(limit) { return st.sugPub.filter(function (x) { return x.status === 'adopted'; }).sort(byNewest).slice(0, limit || 99); }
  function wonCards(list) {
    return list.map(function (x) {
      return '<div class="won"><div class="row"><span class="won-ic">🎉</span><b style="flex:1">' + esc(x.title) + '</b><span class="chip">' + esc(x.category) + '</span></div>' +
        (x.reply ? '<div class="small" style="margin:4px 0 0 2rem">💬 ' + esc(x.reply) + '</div>' : '') + (whoOf(x) ? '<div class="muted small" style="margin:2px 0 0 2rem">' + whoOf(x) + '</div>' : '') + '</div>';
    }).join('');
  }
  /** マイページ上のお知らせ：自分の提案への返事／みんなの提案で実現したこと／提案の入口 */
  function ideaHomeCards() {
    var h = '', un = unseenReplies(), won = wonList(2);
    if (un.length) h += '<div class="card idea-note"><div class="row"><span style="font-size:1.6rem">💡</span><div style="flex:1;min-width:200px"><b>あなたの提案に返事が届きました</b><div class="small muted">' + un.slice(0, 2).map(function (x) { return '「' + esc(x.title) + '」'; }).join('、') + (un.length > 2 ? ' ほか' : '') + '</div></div><button class="btn small" data-toideas>見てみる</button></div></div>';
    if (won.length) h += '<div class="card"><h2>🌟 みんなの提案で実現したこと</h2>' + wonCards(won) + '<p style="margin:8px 0 0"><button class="btn sub small" data-toideas>提案ボックスへ</button></p></div>';
    else if (!un.length) h += '<div class="card idea-cta"><div class="row"><span style="font-size:1.6rem">💡</span><div style="flex:1;min-width:200px"><b>気づいたこと・やってみたいことはありますか？</b><div class="small muted">自己評価とは別に、仕事や職場への提案・意見をいつでも書けます。</div></div><button class="btn sub small" data-toideas>提案ボックスへ</button></div></div>';
    return h;
  }
  function renderIdeas() {
    var view = document.getElementById('view'), mine = st.sugMine.slice().sort(byNewest), won = wonList();
    var html = '<div class="card"><h2>💡 提案ボックス</h2><p class="muted" style="margin:0">仕事のやり方・道具・職場のこと・商品のアイデア・この評価制度のことなど、<b>気づいたことを自由に</b>書いてください。自己評価とは別なので、点数には関係しません。管理者が読んで、返事をします。採用されたものは、みんなに紹介されます。</p></div>' +
      '<div class="card"><h2>✍️ 新しく書く</h2><label class="f">どんなこと？</label><div class="cats" id="sg-cats">' + S.SUG_CATS.map(function (c, i) { return '<button type="button" class="catbtn' + (i === 0 ? ' on' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
      '<label class="f" for="sg-title">ひとことで言うと（' + S.SUG_TITLE_MAX + '字まで）</label><input type="text" id="sg-title" maxlength="' + S.SUG_TITLE_MAX + '" placeholder="例）充填機の洗浄手順を写真つきにしたい">' +
      '<label class="f" for="sg-body">くわしく（' + S.SUG_BODY_MAX + '字まで）</label><textarea id="sg-body" maxlength="' + S.SUG_BODY_MAX + '" rows="4" placeholder="困っていること、こうしたらよくなると思うこと、など"></textarea><div class="small muted" style="text-align:right"><span id="sg-n">0</span> / ' + S.SUG_BODY_MAX + '</div>' +
      '<p style="margin:10px 0 0;text-align:right"><button class="btn" id="sg-send">💌 送る</button></p></div>';
    html += '<div class="card"><h2>📮 自分の提案と返事</h2>' + (mine.length ? mine.map(function (x) {
      return '<div class="sug" data-id="' + esc(x.id) + '"><div class="row"><b style="flex:1">' + esc(x.title) + '</b>' + sugBadge(x) + '</div><div class="muted small">' + esc(x.category) + (x.anonymous ? '・匿名' : '') + '</div>' +
        '<details><summary class="small" style="cursor:pointer;color:var(--pri-d)">書いた内容</summary><p class="small" style="white-space:pre-wrap;margin:6px 0">' + esc(x.body) + '</p></details>' +
        (x.reply ? '<div class="reply-bubble">💬 ' + esc(x.reply) + '</div>' : '') +
        (x.status === 'new' ? '<div style="margin-top:6px"><button class="btn gray small" data-del="' + esc(x.id) + '">取り下げる</button></div>' : '') + '</div>';
    }).join('') : '<p class="muted" style="margin:0">まだ提案はありません。小さなことでも大歓迎です。</p>') + '</div>';
    if (won.length) html += '<div class="card"><h2>🌟 みんなの提案で実現したこと</h2>' + wonCards(won) + '</div>';
    view.innerHTML = html;
    markSugSeen();

    var cat = S.SUG_CATS[0];
    view.onclick = async function (e) {
      var cb = e.target.closest('[data-cat]');
      if (cb) { cat = cb.dataset.cat; view.querySelectorAll('.catbtn').forEach(function (x) { x.classList.toggle('on', x === cb); }); return; }
      var del = e.target.closest('[data-del]');
      if (del) {
        if (!confirm('この提案を取り下げます。よろしいですか？')) return;
        try { await Store.deleteSuggestion(del.dataset.del); st.sugMine = st.sugMine.filter(function (x) { return x.id !== del.dataset.del; }); UI.toast('取り下げました'); renderIdeas(); }
        catch (er) { UI.toast(window.AuthUI.errText(er)); }
        return;
      }
      if (e.target.closest('#sg-send')) {
        var title = document.getElementById('sg-title').value.trim(), body = document.getElementById('sg-body').value.trim();
        if (!title) return UI.toast('「ひとことで言うと」を入力してください');
        if (!body) return UI.toast('「くわしく」を入力してください');
        var id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), now = Date.now();
        var data = { id: id, email: st.user.email, name: st.staff.name, dept: st.staff.dept || '', anonymous: false, category: cat, title: title, body: body, status: 'new', reply: '', public: false, createdAt: now, updatedAt: now };
        var btn = document.getElementById('sg-send'); btn.disabled = true;
        try { await Store.saveSuggestion(id, data); st.sugMine.push(data); UI.confetti(); UI.toast('💌 送りました。ありがとうございます！'); renderIdeas(); window.scrollTo(0, 0); }
        catch (er) { btn.disabled = false; UI.toast('送れませんでした：' + window.AuthUI.errText(er)); }
      }
    };
    view.oninput = function (e) { if (e.target.id === 'sg-body') document.getElementById('sg-n').textContent = e.target.value.length; };
  }

  /* ---------------- これまでの歩み ---------------- */
  function renderHistory() {
    var view = document.getElementById('view'), items = st.items;
    var docs = st.monthly.filter(hasScores).sort(function (a, b) { return a.ym < b.ym ? -1 : 1; });
    if (!docs.length) { view.innerHTML = '<div class="card">まだ記録がありません。今月の自己評価を入力すると、ここに毎月の歩みがたまっていきます。</div>'; return; }
    var first = docs[0].ym, months = S.monthRange(first, st.nowYm), byYm = {}; st.monthly.forEach(function (d) { byYm[d.ym] = d; });
    var pts = months.slice(-12).map(function (ym) { var d = byYm[ym]; return { label: S.monthLabel(ym), v: d && hasScores(d) ? S.average(items, d.scores) : null }; });
    var html = '<div class="card"><h2>📈 毎月の平均点のあゆみ</h2>' + UI.line(pts, '#ee6f8f') + '<p class="muted small" style="text-align:center;margin:4px 0 0">1〜4点の平均。出していない月は点がつながりません。</p></div>' +
      '<div class="card"><h2>🗓 月ごとの記録</h2>' + months.slice().reverse().map(function (ym) {
        var d = byYm[ym], s = S.monthStatus(ym, st.nowYm, d), avg = d && hasScores(d) ? S.average(items, d.scores) : null, stg = S.stageFor(avg);
        var rp = st.replies.filter(function (r) { return r.ym === ym; })[0];
        var per = S.periodForYm(st.periods, ym), gp = d && d.goalProgress ? Object.keys(d.goalProgress).map(function (k) { return d.goalProgress[k]; }) : [];
        var gavg = gp.length ? Math.round(gp.reduce(function (a, b) { return a + b; }, 0) / gp.length) : null;
        var chip = { submitted: '<span class="chip ok">提出ずみ</span>', draft: '<span class="chip warn">入力中</span>', current: '<span class="chip warn">今月・未入力</span>', missed: '<span class="chip gray">未提出</span>', future: '' }[s];
        return '<div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)"><div style="font-size:2rem;width:2.4rem;text-align:center">' + (s === 'missed' && !avg ? '⚠️' : (stg ? stg.emoji : '·')) + '</div><div style="flex:1"><b>' + S.monthLabel(ym, true) + '</b> ' + chip + (stg ? ' <span class="chip">' + esc(stg.title) + '</span>' : '') +
          '<div class="small muted">' + (avg != null ? '平均 ' + avg.toFixed(2) : '') + (gavg != null ? '　目標の進み具合 平均 ' + gavg + '%' : '') + (s === 'missed' && !avg ? 'この月は出していません（さかのぼって入力はできません）' : '') + (per ? '' : '　（期間外）') + '</div>' + (rp ? '<div class="letter-mini">💌 ' + esc(rp.reviewer || '上司') + ' さん：' + esc(rp.text) + '</div>' : '') + '</div></div>';
      }).join('') + '</div>';
    var rel = st.mgrList.slice().sort(function (a, b) { return a.period < b.period ? 1 : -1; });
    if (rel.length) html += '<div class="card"><h2>🏅 半年ごとの評価</h2>' + rel.map(function (m) {
      var p = periodObj(m.period), a = S.average(items, m.scores), stg = S.stageFor(a), goals = goalsFor(m.period), ga = S.goalAchievement(goals, m.goalScores);
      return '<div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)"><div style="font-size:2.2rem">' + (stg ? stg.emoji : '') + '</div><div><b>' + esc(p ? p.label : m.period) + '</b> ' + (stg ? '<span class="chip">' + esc(stg.title) + '</span>' : '') + '<div class="small muted">上司の評価 平均 ' + (a != null ? a.toFixed(2) : '—') + (ga != null ? '　目標の達成度 ' + ga + '%' : '') + '</div></div></div>';
    }).join('') + '</div>';
    view.innerHTML = html;
  }

  /* ---------------- 起動 ---------------- */
  window.AuthUI.start({
    root: 'app', admin: false,
    onReady: async function (user, staff) {
      st = { user: user, staff: staff, items: S.itemsForDepts(window.COMPETENCY_ITEMS, S.deptsOf(staff)), tab: 'home' };
      try { await load(); renderShell(); render(); }
      catch (e) { app.innerHTML = '<div class="wrap"><div class="msg err">読み込みに失敗しました：' + esc(window.AuthUI.errText(e)) + '</div><button class="btn gray" onclick="location.reload()">再読み込み</button></div>'; }
    }
  });
})();
