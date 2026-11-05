/* 管理画面：評価一覧・管理者評価の入力と公開・社員名簿・評価期間 */
(function () {
  var S = window.Scoring, UI = window.UI, Store = window.Store, esc = UI.esc;
  var app = document.getElementById('app');
  var DEPTS = Object.keys(window.COMPETENCY_ITEMS);
  var st = {};
  var saveTimer = null;
  var TERM = function () { return S.TERM; };

  function itemsOf(staffRec) { return S.itemsForDepts(window.COMPETENCY_ITEMS, S.deptsOf(staffRec)); }
  function periodObj(id) { return st.periods.filter(function (p) { return p.id === id; })[0]; }
  function hasScores(d) { return d && Object.keys(d.scores || {}).some(function (k) { return S.isScored(d.scores[k]); }); }
  function docsOf(email) { return (st.monthlyMap[email] || []).slice().sort(function (a, b) { return a.ym < b.ym ? -1 : 1; }); }
  function latestOf(email) { var l = docsOf(email).filter(hasScores); return l[l.length - 1] || null; }
  function targets() { return st.staffList.filter(function (s) { return s.active !== false && itemsOf(s).length; }).sort(function (a, b) { return (S.deptLabel(a) + a.name) < (S.deptLabel(b) + b.name) ? -1 : 1; }); }
  function stageChip(items, scores) {
    var a = S.average(items, scores), s = S.stageFor(a);
    return s ? s.emoji + ' ' + esc(s.title) + ' <span class="muted small">' + a.toFixed(2) + '</span>' : '<span class="muted">—</span>';
  }
  function group(list, key) { var m = {}; list.forEach(function (x) { (m[x[key]] = m[x[key]] || []).push(x); }); return m; }
  function mapBy(list) { var m = {}; list.forEach(function (x) { m[x.email] = x; }); return m; }

  /** 提出ずみなのに、まだ返事をしていない月（新着のお知らせ）。新しい順。本人の記載ありを先に */
  function pendingReplies() {
    var out = [];
    targets().forEach(function (s) {
      docsOf(s.email).forEach(function (d) {
        if (d.status === 'submitted' && !st.repMap[s.email + '|' + d.ym]) out.push({ s: s, d: d, writing: S.hasWriting(d) });
      });
    });
    return out.sort(function (a, b) { return (b.writing - a.writing) || ((b.d.submittedAt || 0) - (a.d.submittedAt || 0)); });
  }
  function fmtDay(ms) { if (!ms) return ''; var d = new Date(ms + 9 * 3600e3); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate(); }
  function snippet(t, n) { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; }
  function writingOf(d) {
    var out = [];
    if ((d.memo || '').trim()) out.push({ k: '今月のひとこと', t: d.memo });
    Object.keys(d.goalNotes || {}).forEach(function (k) { if ((d.goalNotes[k] || '').trim()) out.push({ k: '目標' + k + 'のメモ', t: d.goalNotes[k] }); });
    return out;
  }
  function noticeCard() {
    var list = pendingReplies(), w = list.filter(function (x) { return x.writing; }).length;
    var ns = (st.sugs || []).filter(function (x) { return x.status === 'new'; }).length;
    var sugLine = ns ? '<div class="nitem" data-toideas><div class="nh"><b>💡 新しい提案が ' + ns + '件 届いています</b> <span class="small muted">社員からの意見・アイデア</span></div><span class="btn small">提案を見る</span></div>' : '';
    if (!list.length) return '<div class="card notice' + (ns ? '' : ' ok') + '"><h2>📬 新着のお知らせ</h2><p style="margin:0">✅ 返事待ちの提出はありません。</p>' + sugLine + '</div>';
    return '<div class="card notice"><h2>📬 新着のお知らせ <span class="chip warn">返事待ち ' + list.length + '件</span>' + (w ? ' <span class="chip">💬 本人の記載あり ' + w + '件</span>' : '') + '</h2>' +
      '<p class="muted small" style="margin-top:0">自己評価が提出されると、ここに出ます。ひとこと返す（または「確認した」を押す）と消えます。</p>' +
      list.slice(0, 8).map(function (x) {
        var wr = writingOf(x.d);
        return '<div class="nitem" data-open="' + esc(x.s.email) + '" data-ym="' + x.d.ym + '"><div class="nh"><b>' + esc(x.s.name) + '</b> <span class="chip">' + esc(S.deptLabel(x.s)) + '</span> <span class="small">' + S.monthLabel(x.d.ym) + '分を提出</span>' +
          (x.d.submittedAt ? ' <span class="muted small">（' + fmtDay(x.d.submittedAt) + '）</span>' : '') + (x.writing ? ' <span class="chip warn">💬 記載あり</span>' : '') + '</div>' +
          (wr.length ? '<div class="nq">「' + esc(snippet(wr[0].t, 60)) + '」</div>' : '') + '<span class="btn small">返事を書く</span></div>';
      }).join('') + (list.length > 8 ? '<p class="muted small" style="margin:8px 0 0">ほか ' + (list.length - 8) + '件（社員を開くと表示されます）</p>' : '') + sugLine + '</div>';
  }

  async function loadAll() {
    st.nowYm = S.nowYm();
    st.periods = await Store.listPeriods();
    st.staffList = await Store.listStaff();
    st.sugs = await Store.listSuggestions();
    if (!st.period) st.period = ((S.periodForYm(st.periods, st.nowYm) || st.periods.filter(function (p) { return p.status === 'open'; })[0] || st.periods[0]) || {}).id || null;
    await loadPeriod();
  }
  async function loadPeriod() {
    if (!st.period) { st.monthlyMap = {}; st.goalsMap = {}; st.mgrMap = {}; st.repMap = {}; return; }
    var r = await Promise.all([Store.listMonthly(st.period), Store.listGoals(st.period), Store.listMgr(st.period), Store.listReplies(st.period)]);
    st.monthlyMap = group(r[0], 'email'); st.goalsMap = mapBy(r[1]); st.mgrMap = mapBy(r[2]);
    st.repMap = {}; r[3].forEach(function (x) { st.repMap[x.email + '|' + x.ym] = x; });
  }

  function renderShell() {
    app.innerHTML =
      (Store.mode === 'demo' ? '<div class="demo-banner">🧪 デモモード（ダミーデータ・Firebase未接続）　今日＝' + esc(S.monthLabel(st.nowYm, true)) + ' <a href="#" id="reset-demo">デモをリセット</a></div>' : '') +
      '<header class="site-header"><div class="in"><span class="brand"><img class="logo" src="icons/logo.png" alt="" width="32" height="32"> ' + esc(window.APP_CONFIG.appName || '成長ノート') + '</span><span class="mode-chip">管理画面</span><span class="spacer"></span>' +
      '<div class="who">' + esc(st.staff.name) + '<br><span style="opacity:.9">管理者</span></div><a href="index.html">本人画面へ</a><button class="link" id="logout">ログアウト</button></div></header>' +
      '<div class="admin-banner">🔒 管理者専用の画面です。ここでの入力は、「公開」するまで本人には見えません。</div>' +
      '<main class="wrap"><div class="tabs" id="tabs"><button class="tab" data-t="list">📊 評価一覧<span class="dot hidden" id="tb-list"></span></button><button class="tab" data-t="ideas">💡 提案<span class="dot hidden" id="tb-ideas"></span></button><button class="tab" data-t="staff">👥 社員名簿</button><button class="tab" data-t="periods">🗓 評価期間</button></div><div id="view"></div></main><div id="dock-slot"></div>';
    document.getElementById('logout').onclick = function () { Store.signOut(); };
    var rd = document.getElementById('reset-demo'); if (rd) rd.onclick = function (e) { e.preventDefault(); Store.resetDemo(); location.reload(); };
    document.getElementById('tabs').onclick = async function (e) { var b = e.target.closest('[data-t]'); if (b) { await flush(); st.tab = b.dataset.t; st.detail = null; render(); } };
  }

  function updateDot() {
    var el = document.getElementById('tb-list'); if (!el) return;
    var n = pendingReplies().length; el.textContent = n; el.classList.toggle('hidden', !n);
    var e2 = document.getElementById('tb-ideas'), k = (st.sugs || []).filter(function (x) { return x.status === 'new'; }).length;
    if (e2) { e2.textContent = k; e2.classList.toggle('hidden', !k); }
  }

  function render() {
    updateDot();
    document.querySelectorAll('#tabs .tab').forEach(function (b) { b.classList.toggle('on', b.dataset.t === st.tab); });
    document.getElementById('dock-slot').innerHTML = '';
    var v = document.getElementById('view'); v.onclick = null; v.oninput = null; v.onchange = null;
    if (st.tab === 'ideas') return renderIdeas();
    if (st.tab === 'staff') return renderStaff();
    if (st.tab === 'periods') return renderPeriods();
    if (st.detail) return renderDetail();
    renderList();
  }

  /* ---------------- 評価一覧 ---------------- */
  function renderList() {
    var v = document.getElementById('view'), list = targets(), p = periodObj(st.period);
    if (!p) { v.innerHTML = '<div class="card">評価期間がありません。「評価期間」タブで作成してください。</div>'; return; }
    var months = S.monthRange(p.startYm, p.endYm), inPeriod = st.nowYm >= p.startYm && st.nowYm <= p.endYm;
    var elapsed = months.filter(function (ym) { return ym <= st.nowYm; }).length;
    var nNow = 0, nGoal = 0, nMgr = 0, nRel = 0;
    var rows = list.map(function (s) {
      var items = itemsOf(s), docs = docsOf(s.email), g = st.goalsMap[s.email], mgr = st.mgrMap[s.email], lat = latestOf(s.email);
      var sub = docs.filter(function (d) { return d.status === 'submitted'; }).length, nowDoc = docs.filter(function (d) { return d.ym === st.nowYm; })[0];
      var mp = S.progress(items, mgr && mgr.scores);
      if (nowDoc && nowDoc.status === 'submitted') nNow++;
      if (g && g.status === 'fixed') nGoal++;
      if (mgr && mp.answered === mp.total && mp.total) nMgr++;
      if (mgr && mgr.released) nRel++;
      var nowChip = !inPeriod ? '<span class="muted">—</span>' : (nowDoc && nowDoc.status === 'submitted' ? '<span class="chip ok">提出済み</span>' + (st.repMap[s.email + '|' + st.nowYm] ? ' <span class="chip">💌返信ずみ</span>' : ' <span class="chip warn">返事待ち</span>') : (nowDoc && hasScores(nowDoc) ? '<span class="chip warn">入力中</span>' : '<span class="chip gray">未提出</span>'));
      var gChip = !g ? '<span class="chip gray">未設定</span>' : (g.status === 'fixed' ? '<span class="chip ok">確定 ' + g.goals.length + '件</span>' : '<span class="chip warn">下書き</span>');
      var mChip = !mgr ? '<span class="chip gray">未評価</span>' : (mgr.released ? '<span class="chip ok">公開済み</span>' : '<span class="chip warn">下書き ' + mp.answered + '/' + mp.total + '</span>');
      return '<tr class="click" data-email="' + esc(s.email) + '"><td><b>' + esc(s.name) + '</b><div class="muted small">' + esc(s.email) + '</div></td><td>' + esc(S.deptLabel(s)) + '</td><td>' + nowChip + '</td>' +
        '<td>' + sub + ' / ' + elapsed + '<div class="muted small">提出月数</div></td><td>' + gChip + '</td><td>' + (lat ? stageChip(items, lat.scores) + '<div class="muted small">' + S.monthLabel(lat.ym) + '分</div>' : '—') + '</td>' +
        '<td>' + mChip + '</td><td>' + (mgr && mgr.released ? stageChip(items, mgr.scores) : '—') + '</td><td><button class="btn small">評価する</button></td></tr>';
    });
    v.innerHTML = noticeCard() + '<div class="row" style="margin-bottom:12px"><label class="f" style="margin:0" for="psel">評価期間（半年）</label><select id="psel" style="width:auto;min-width:240px">' +
      st.periods.map(function (q) { return '<option value="' + esc(q.id) + '"' + (q.id === st.period ? ' selected' : '') + '>' + esc(q.label) + '（' + S.monthLabel(q.startYm) + '〜' + S.monthLabel(q.endYm) + '）' + (q.status === 'open' ? '' : '・終了') + '</option>'; }).join('') +
      '</select><span class="spacer"></span><button class="btn sub small" id="csv">⬇ CSVで保存</button></div>' +
      '<div class="stats"><div class="card stat"><div class="n">' + list.length + '</div>対象者</div><div class="card stat"><div class="n">' + (inPeriod ? nNow : '—') + '</div>' + esc(S.monthLabel(st.nowYm)) + 'の自己評価 提出済み</div><div class="card stat"><div class="n">' + nGoal + '</div>目標 確定済み</div><div class="card stat"><div class="n">' + nMgr + '</div>管理者評価 入力済み</div><div class="card stat"><div class="n">' + nRel + '</div>本人に公開済み</div></div>' +
      '<div class="card tbl-wrap"><table><thead><tr><th>氏名</th><th>部署</th><th>今月の自己評価</th><th>提出月数</th><th>半年の目標</th><th>最新の自己評価</th><th>管理者評価</th><th>公開後の' + esc(TERM()) + '</th><th></th></tr></thead><tbody>' +
      (rows.join('') || '<tr><td colspan="9" class="muted">対象の社員がいません。「社員名簿」で部署つきで登録してください。</td></tr>') + '</tbody></table></div>';
    document.getElementById('psel').onchange = async function (e) { st.period = e.target.value; await loadPeriod(); render(); };
    document.getElementById('csv').onclick = downloadCsv;
    v.onclick = function (e) {
      if (e.target.closest('[data-toideas]')) { st.tab = 'ideas'; render(); window.scrollTo(0, 0); return; }
      var n = e.target.closest('.nitem');
      if (n) { st.detail = n.dataset.open; st.cmpYm = null; st.focusYm = n.dataset.ym; render(); return; }
      var tr = e.target.closest('tr[data-email]'); if (tr) { st.detail = tr.dataset.email; st.cmpYm = null; render(); window.scrollTo(0, 0); }
    };
  }

  function downloadCsv() {
    var p = periodObj(st.period), months = S.monthRange(p.startYm, p.endYm), elapsed = months.filter(function (ym) { return ym <= st.nowYm; }).length;
    var head = ['期間', '氏名', '部署', 'メール', '提出月数', '対象月数', '目標の状態', '最新の自己評価(月)', '自己平均', '自己' + TERM(), '管理者評価状況', '管理者平均', '管理者' + TERM(), '目標の達成度(%)'];
    var lines = [head].concat(targets().map(function (s) {
      var items = itemsOf(s), docs = docsOf(s.email), lat = latestOf(s.email), mgr = st.mgrMap[s.email], g = st.goalsMap[s.email];
      var sa = lat ? S.average(items, lat.scores) : null, ma = mgr ? S.average(items, mgr.scores) : null;
      return [p.label, s.name, S.deptLabel(s), s.email, docs.filter(function (d) { return d.status === 'submitted'; }).length, elapsed, g ? (g.status === 'fixed' ? '確定' : '下書き') : '未設定',
        lat ? lat.ym : '', sa == null ? '' : sa.toFixed(2), sa == null ? '' : S.stageFor(sa).title, mgr ? (mgr.released ? '公開済み' : '下書き') : '未評価', ma == null ? '' : ma.toFixed(2), ma == null ? '' : S.stageFor(ma).title,
        mgr && g ? (S.goalAchievement(g.goals, mgr.goalScores) == null ? '' : S.goalAchievement(g.goals, mgr.goalScores)) : ''];
    }));
    var csv = '﻿' + lines.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = '力量評価_' + st.period + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------------- 個別の評価 ---------------- */
  function renderDetail() {
    var v = document.getElementById('view'), email = st.detail, p = periodObj(st.period);
    var s = st.staffList.filter(function (x) { return x.email === email; })[0];
    var items = itemsOf(s), docs = docsOf(email), goalDoc = st.goalsMap[email] || null, goals = goalDoc ? goalDoc.goals : [];
    var withScores = docs.filter(hasScores);
    var cmp = (st.cmpYm && docs.filter(function (d) { return d.ym === st.cmpYm; })[0]) || withScores[withScores.length - 1] || null;
    var sc = cmp ? cmp.scores || {} : {}, scm = cmp ? cmp.comments || {} : {};
    var m = st.mgrMap[email] ? JSON.parse(JSON.stringify(st.mgrMap[email])) : { period: st.period, email: email, dept: s.dept || '', scores: {}, comments: {}, goalScores: {}, goalComments: {}, overall: '', released: false, reviewer: st.staff.name };
    ['scores', 'comments', 'goalScores', 'goalComments'].forEach(function (k) { m[k] = m[k] || {}; });
    st.work = m; st.workItems = items; st.workGoals = goals;

    var cats = [], map = {};
    items.forEach(function (it) { if (!map[it.cat]) { map[it.cat] = []; cats.push(it.cat); } map[it.cat].push(it); });
    var months = S.monthRange(p.startYm, p.endYm);

    st.repStaff = s; st.repDocs = docs; st.repItems = items;
    var html = '<div class="row" style="margin-bottom:10px"><button class="btn gray small" id="back">← 一覧にもどる</button><h2 style="margin:0">' + esc(s.name) + ' <span class="chip">' + esc(S.deptLabel(s)) + '</span></h2><span class="chip">' + esc(p.label) + '</span><span id="rel-chip"></span></div>' +
      '<div class="card"><h2>📅 毎月の自己評価の提出状況</h2><div class="months">' + months.map(function (ym) {
        var d = docs.filter(function (x) { return x.ym === ym; })[0], stt = S.monthStatus(ym, st.nowYm, d), a = d && hasScores(d) ? S.average(items, d.scores) : null;
        var icon = { submitted: '✅', draft: '📝', current: '✏️', missed: '⚠️', future: '🔒' }[stt], txt = { submitted: '提出ずみ', draft: '入力中', current: '今月・未', missed: '未提出', future: '' }[stt];
        return '<div class="mchip ' + stt + '"><div class="mm">' + S.monthLabel(ym) + '</div><div class="ic">' + icon + '</div><div class="tx">' + txt + (a != null ? ' ・' + a.toFixed(2) : '') + '</div></div>';
      }).join('') + '</div><p class="muted small" style="margin:8px 0 0">本人は、その月のうちにしか入力・提出できません（サーバーの時刻で制限）。出し忘れた月をあとから入れることはできません。</p></div>' +
      replyCard(s, docs) +
      '<div class="card"><h2>🎯 半年の目標と評価</h2>' + (goalDoc ? '<p class="muted small" style="margin-top:0">目標：' + (goalDoc.status === 'fixed' ? '<span class="chip ok">確定ずみ</span>' : '<span class="chip warn">本人が下書き中</span>') + '</p>' : '<p class="muted">本人はまだ目標を設定していません。</p>') +
      goals.map(function (g) {
        var dots = months.map(function (ym) {
          var d = docs.filter(function (x) { return x.ym === ym; })[0], pv = d && d.goalProgress ? d.goalProgress[g.id] : undefined, nt = d && d.goalNotes ? d.goalNotes[g.id] : '';
          return '<span class="gdot" title="' + esc(nt || '') + '">' + S.monthLabel(ym) + '<b>' + (typeof pv === 'number' ? pv + '%' : '–') + '</b>' + (nt ? ' 💬' : '') + '</span>';
        }).join('');
        var notes = docs.filter(function (d) { return d.goalNotes && d.goalNotes[g.id]; }).map(function (d) { return '<div class="small muted">' + S.monthLabel(d.ym) + '：' + esc(d.goalNotes[g.id]) + '</div>'; }).join('');
        return '<div class="goal" data-gid="' + g.id + '"><b>' + esc(g.title) + '</b>' + (g.action ? '<div class="small muted">やること：' + esc(g.action) + '</div>' : '') + '<div class="gdots" style="margin:6px 0">' + dots + '</div>' + notes +
          '<div class="row" style="margin-top:8px"><b class="small">達成度</b><div class="mini-lv" data-glv>' + S.GOAL_LEVELS.map(function (l) { return '<button type="button" data-s="' + l.score + '" class="' + (m.goalScores[g.id] === l.score ? 'on' : '') + '" title="' + esc(l.short) + '" style="width:auto;padding:0 10px">' + l.name + '</button>'; }).join('') + '</div></div>' +
          '<input type="text" data-gc value="' + esc(m.goalComments[g.id] || '') + '" placeholder="目標へのコメント（任意）" style="margin-top:6px"></div>';
      }).join('') + '</div>' +
      '<div class="grid2" style="margin-bottom:16px"><div class="card"><div class="stage-label">本人の自己評価（' + (cmp ? S.monthLabel(cmp.ym) + '分' : 'なし') + '）</div><div id="st-self" style="font-size:1.3rem;font-weight:800"></div>' +
      (withScores.length > 1 ? '<div class="small" style="margin-top:6px">比べる月：<select id="cmp-ym" style="width:auto">' + withScores.map(function (d) { return '<option value="' + d.ym + '"' + (cmp && d.ym === cmp.ym ? ' selected' : '') + '>' + S.monthLabel(d.ym) + '分</option>'; }).join('') + '</select></div>' : '') +
      '</div><div class="card"><div class="stage-label">管理者評価（入力中の結果）</div><div id="st-mgr" style="font-size:1.3rem;font-weight:800"></div></div></div>' +
      '<div class="card"><details><summary style="cursor:pointer;font-weight:700;color:var(--pri-d)">評価の基準（1〜4点）</summary>' + S.LEVELS.map(function (l) { return '<p style="margin:6px 0"><b>' + l.mark + ' ' + l.name + '（' + l.score + '点）</b>：' + esc(l.short) + '<br><span class="muted small">' + esc(l.original) + '</span></p>'; }).join('') + '</details>' +
      '<p class="muted small" style="margin:8px 0 0">ボタン：1=×要支援　2=△補助　3=〇自立　4=◎熟練・指導　／「–」=対象外。「差」は 管理者−本人 です。</p></div>' +
      '<div class="card tbl-wrap cmp"><table><thead><tr><th>No</th><th style="min-width:230px">力量項目</th><th>本人</th><th>管理者の評価</th><th>差</th><th style="min-width:160px">本人コメント</th><th style="min-width:180px">管理者コメント</th></tr></thead><tbody>';
    cats.forEach(function (c) {
      html += '<tr class="catrow"><td colspan="7">' + esc(c) + '</td></tr>';
      map[c].forEach(function (it) {
        var sv = sc[it.no], mv = m.scores[it.no];
        html += '<tr data-no="' + it.no + '"><td>' + (it.dispNo || it.no) + '</td><td><b>' + esc(it.name) + '</b><details><summary class="muted small" style="cursor:pointer">評価基準</summary><div class="small muted">' + esc(it.criteria) + '</div></details></td>' +
          '<td class="sc">' + (sv >= 1 ? S.LEVELS[sv - 1].mark + '<div class="muted small">' + sv + '</div>' : (sv === 0 ? '<span class="muted small">対象外</span>' : '<span class="muted">—</span>')) + '</td>' +
          '<td><div class="mini-lv">' + [1, 2, 3, 4, 0].map(function (n) { return '<button type="button" data-s="' + n + '" class="' + (mv === n ? 'on' : '') + '" title="' + (n ? S.LEVELS[n - 1].name : '対象外') + '">' + (n ? n : '–') + '</button>'; }).join('') + '</div></td>' +
          '<td class="sc" data-gap></td><td class="small">' + esc(scm[it.no] || '') + '</td><td><input type="text" data-mc value="' + esc(m.comments[it.no] || '') + '" placeholder="任意"></td></tr>';
      });
    });
    html += '</tbody></table></div><div class="card"><h2>💌 本人へのメッセージ（総評）</h2><textarea id="overall" placeholder="頑張っていること・次に期待することなど。公開すると本人のマイページに表示されます。">' + esc(m.overall || '') + '</textarea></div>';
    v.innerHTML = html;

    var nowDoc = docs.filter(function (d) { return d.ym === st.nowYm; })[0], canReturn = nowDoc && nowDoc.status === 'submitted';
    document.getElementById('dock-slot').innerHTML = '<div class="dock"><div class="in"><div style="flex:1;min-width:140px"><div class="small"><b id="pg-t"></b></div><div class="bar"><i id="pg-b" style="width:0"></i></div></div><span class="save-st" id="save-st"></span>' +
      (canReturn ? '<button class="btn sub small" id="return" title="' + S.monthLabel(st.nowYm) + '分を入力中に戻します（今月のうちだけ本人が直せます）">今月分を差し戻す</button>' : '') +
      '<button class="btn sub" id="save">保存</button><button class="btn" id="release"></button></div></div>';

    refreshDetail(sc);
    if (st.focusYm) {
      var fb = document.querySelector('.rep[data-ym="' + st.focusYm + '"]'); st.focusYm = null;
      if (fb) { fb.classList.add('flash'); fb.scrollIntoView({ block: 'center' }); var ft = fb.querySelector('[data-rtext]'); if (ft) ft.focus({ preventScroll: true }); }
    } else window.scrollTo(0, 0);
    document.getElementById('back').onclick = async function () { await flush(); st.detail = null; render(); };
    var cy = document.getElementById('cmp-ym'); if (cy) cy.onchange = async function (e) { await flush(); st.cmpYm = e.target.value; renderDetail(); };
    v.onclick = function (e) {
      var stamp = e.target.closest('[data-stamp]');
      if (stamp) { var ta = stamp.closest('.rep').querySelector('[data-rtext]'), t = STAMPS[+stamp.dataset.stamp]; ta.value = (ta.value ? ta.value.replace(/\s+$/, '') + ' ' : '') + t; ta.focus(); return; }
      var rs = e.target.closest('[data-rsave]'); if (rs) { saveReply(rs.closest('.rep'), false); return; }
      var rn = e.target.closest('[data-rseen]'); if (rn) { saveReply(rn.closest('.rep'), true); return; }
      var gb = e.target.closest('[data-glv] button');
      if (gb) { var gid = gb.closest('.goal').dataset.gid; m.goalScores[gid] = Number(gb.dataset.s); gb.parentNode.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === gb); }); refreshDetail(sc); queueSave(); return; }
      var b = e.target.closest('tr .mini-lv button'); if (!b) return;
      var tr = b.closest('tr'), no = tr.dataset.no, n = Number(b.dataset.s);
      m.scores[no] = n; tr.querySelectorAll('.mini-lv button').forEach(function (x) { x.classList.toggle('on', x === b); });
      refreshDetail(sc); queueSave();
    };
    v.oninput = function (e) {
      if (e.target.matches('[data-mc]')) m.comments[e.target.closest('tr').dataset.no] = e.target.value;
      else if (e.target.matches('[data-gc]')) m.goalComments[e.target.closest('.goal').dataset.gid] = e.target.value;
      else if (e.target.id === 'overall') m.overall = e.target.value; else return;
      queueSave();
    };
    document.getElementById('save').onclick = async function () { if (await saveMgr()) UI.toast('保存しました'); };
    document.getElementById('release').onclick = toggleRelease;
    var rt = document.getElementById('return');
    if (rt) rt.onclick = async function () {
      if (!confirm(s.name + 'さんの' + S.monthLabel(st.nowYm) + '分を「入力中」に戻します。今月のうちだけ、本人が再び編集できます。よろしいですか？')) return;
      try { var d = Object.assign({}, nowDoc, { status: 'draft', updatedAt: Date.now() }); delete d.submittedAt; await Store.saveMonthly(st.nowYm, email, d);
        st.monthlyMap[email] = docs.map(function (x) { return x.ym === st.nowYm ? d : x; }); UI.toast('差し戻しました'); renderDetail(); }
      catch (er) { UI.toast(window.AuthUI.errText(er)); }
    };
  }

  /* ---------------- 毎月のひとこと返信 ---------------- */
  var STAMPS = ['今月もありがとう🌷', 'ていねいなふりかえりが伝わってきます', 'いつも助かっています✨', '面談で一緒に話しましょう', '無理せず、困ったら声をかけてね'];
  function replyCard(s, docs) {
    var subs = docs.filter(function (d) { return d.status === 'submitted'; }).sort(function (a, b) { return a.ym < b.ym ? 1 : -1; });
    var pend = subs.filter(function (d) { return !st.repMap[s.email + '|' + d.ym]; }).length;
    return '<div class="card" id="rep-card"><h2>💌 毎月のひとこと返信 ' + (pend ? '<span class="chip warn">返事待ち ' + pend + '件</span>' : '') + '</h2>' +
      '<p class="muted small" style="margin-top:0">1〜2行で十分です。返すと、本人のマイページに「💌 ひとこと」として届き、既読もここで分かります（' + S.REPLY_MAX + '字まで）。</p>' +
      (subs.length ? subs.map(function (d) { return replyRow(s, d); }).join('') : '<p class="muted">まだ提出された月がありません。</p>') + '</div>';
  }
  function replyRow(s, d) {
    var r = st.repMap[s.email + '|' + d.ym], wr = writingOf(d), cm = Object.keys(d.comments || {}).filter(function (k) { return (d.comments[k] || '').trim(); });
    var status = !r ? '<span class="chip warn">返事待ち</span>' : (r.text ? '<span class="chip ok">返信ずみ</span> ' + (r.readAt ? '<span class="chip">👀 既読</span>' : '<span class="chip gray">未読</span>') : '<span class="chip gray">確認ずみ（返信なし）</span>');
    var a = hasScores(d) ? S.average(st.repItems, d.scores) : null;
    return '<div class="rep" data-ym="' + d.ym + '"><div class="row"><b>' + S.monthLabel(d.ym, true) + '分</b>' + status + (a != null ? '<span class="muted small">平均 ' + a.toFixed(2) + '</span>' : '') + '</div>' +
      (wr.length ? wr.map(function (w) { return '<div class="rq"><span class="rk">' + esc(w.k) + '</span>' + esc(w.t) + '</div>'; }).join('') : '<div class="muted small">本人のひとこと：なし</div>') +
      (cm.length ? '<details><summary class="muted small" style="cursor:pointer">項目コメント ' + cm.length + '件</summary>' + cm.map(function (k) {
        var it = st.repItems.filter(function (i) { return String(i.no) === k; })[0]; return '<div class="small"><b>' + (it ? (it.dispNo || it.no) : k) + ' ' + esc(it ? it.name : '') + '</b>：' + esc(d.comments[k]) + '</div>'; }).join('') + '</details>' : '') +
      '<textarea data-rtext maxlength="' + S.REPLY_MAX + '" rows="2" placeholder="例）' + S.monthLabel(d.ym) + 'もありがとう。◯◯が上手になってきましたね。">' + esc(r ? r.text || '' : '') + '</textarea>' +
      '<div class="row" style="margin-top:6px"><span class="stamps">' + STAMPS.map(function (t, i) { return '<button type="button" class="stamp" data-stamp="' + i + '">' + esc(t) + '</button>'; }).join('') + '</span><span class="spacer"></span>' +
      '<button type="button" class="btn sub small" data-rseen>' + (r && !r.text ? '確認ずみ' : '返信なしで確認した') + '</button><button type="button" class="btn small" data-rsave>' + (r && r.text ? '書き直して送る' : '送る') + '</button></div></div>';
  }
  async function saveReply(box, textOnly) {
    var s = st.repStaff, ym = box.dataset.ym, ta = box.querySelector('[data-rtext]'), text = textOnly ? '' : ta.value.trim(), old = st.repMap[s.email + '|' + ym], now = Date.now();
    if (!textOnly && !text) return UI.toast('ひとことを入力してください（返事をしないときは「返信なしで確認した」）');
    var data = { ym: ym, period: st.period, email: s.email, name: s.name, text: text, seen: true, reviewer: S.cleanReviewer(st.staff.name), createdAt: old ? old.createdAt || now : now, updatedAt: now };
    if (old && old.text === text && old.readAt) data.readAt = old.readAt;
    var btns = box.querySelectorAll('button'); btns.forEach(function (b) { b.disabled = true; });
    try {
      await Store.saveReply(ym, s.email, data); st.repMap[s.email + '|' + ym] = data;
      var d = st.repDocs.filter(function (x) { return x.ym === ym; })[0], tmp = document.createElement('div'); tmp.innerHTML = replyRow(s, d); box.replaceWith(tmp.firstChild);
      var h = document.querySelector('#rep-card h2'); if (h) h.innerHTML = '💌 毎月のひとこと返信 ' + (function () { var n = st.repDocs.filter(function (x) { return x.status === 'submitted' && !st.repMap[s.email + '|' + x.ym]; }).length; return n ? '<span class="chip warn">返事待ち ' + n + '件</span>' : ''; })();
      updateDot(); UI.toast(textOnly ? '確認ずみにしました' : '💌 ひとことを送りました');
    } catch (e) { btns.forEach(function (b) { b.disabled = false; }); UI.toast('送れませんでした：' + window.AuthUI.errText(e)); }
  }

  function refreshDetail(sc) {
    var m = st.work, items = st.workItems, goals = st.workGoals, p = S.progress(items, m.scores);
    var gAnswered = goals.filter(function (g) { return S.isScored(m.goalScores[g.id]); }).length;
    var all = p.answered + gAnswered, tot = p.total + goals.length;
    document.getElementById('pg-t').textContent = '管理者評価 入力 ' + all + ' / ' + tot + (goals.length ? '（うち目標 ' + gAnswered + '/' + goals.length + '）' : '');
    document.getElementById('pg-b').style.width = Math.round(all / Math.max(1, tot) * 100) + '%';
    document.getElementById('st-self').innerHTML = stageChip(items, sc);
    document.getElementById('st-mgr').innerHTML = stageChip(items, m.scores);
    document.querySelectorAll('#view tr[data-no]').forEach(function (tr) {
      var no = tr.dataset.no, a = sc[no], b = m.scores[no], cell = tr.querySelector('[data-gap]');
      if (S.isScored(a) && S.isScored(b)) { var d = b - a; cell.innerHTML = d > 0 ? '<span class="gap-up">+' + d + '</span>' : (d < 0 ? '<span class="gap-down">' + d + '</span>' : '<span class="muted">0</span>'); }
      else cell.innerHTML = '<span class="muted">—</span>';
    });
    document.getElementById('release').textContent = m.released ? '公開を取り消す' : '本人に公開する';
    document.getElementById('release').className = 'btn' + (m.released ? ' danger' : '');
    document.getElementById('rel-chip').innerHTML = m.released ? '<span class="chip ok">本人に公開済み</span>' : '<span class="chip gray">未公開（本人には見えません）</span>';
  }

  function queueSave() { document.getElementById('save-st').textContent = '保存中…'; clearTimeout(saveTimer); saveTimer = setTimeout(saveMgr, 1000); }
  async function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; await saveMgr(); } }
  async function saveMgr() {
    clearTimeout(saveTimer); saveTimer = null;
    var m = st.work; if (!m) return false;
    var data = { period: st.period, email: m.email, dept: m.dept, scores: m.scores, comments: m.comments, goalScores: m.goalScores, goalComments: m.goalComments,
      overall: m.overall || '', released: !!m.released, reviewer: st.staff.name, updatedAt: Date.now() };
    if (m.released) data.releasedAt = m.releasedAt || Date.now();
    try {
      await Store.saveMgr(st.period, m.email, data); st.mgrMap[m.email] = data;
      var el = document.getElementById('save-st'); if (el) el.textContent = '✓ 保存しました'; return true;
    } catch (e) { UI.toast('保存できませんでした：' + window.AuthUI.errText(e)); var el2 = document.getElementById('save-st'); if (el2) el2.textContent = '⚠ 保存失敗'; return false; }
  }
  async function toggleRelease() {
    var m = st.work, p = S.progress(st.workItems, m.scores), goals = st.workGoals;
    var gMissing = goals.filter(function (g) { return !S.isScored(m.goalScores[g.id]); }).length;
    if (!m.released) {
      if (p.answered < p.total) return UI.toast('全項目の評価を入力してから公開してください（あと' + (p.total - p.answered) + '項目）');
      if (gMissing) return UI.toast('目標の達成度も入力してから公開してください（あと' + gMissing + '件）');
      if (!confirm('この内容を本人に公開します。本人のマイページに点数・コメント・総評・目標の達成度が表示されます。よろしいですか？')) return;
      m.released = true; m.releasedAt = Date.now();
    } else {
      if (!confirm('公開を取り消します。本人からは見えなくなります。')) return;
      m.released = false; delete m.releasedAt;
    }
    if (await saveMgr()) { UI.toast(m.released ? '本人に公開しました' : '公開を取り消しました'); var l = latestOf(m.email); refreshDetail(l ? l.scores || {} : {}); }
  }

  /* ---------------- 提案ボックス ---------------- */
  function sugRow(x) {
    var s = S.sugStatus(x.status), who = x.anonymous ? '<span class="chip gray">匿名</span>' : '<b>' + esc(x.name) + '</b> <span class="muted small">' + esc(x.dept || '') + '</span>';
    var d = new Date((x.createdAt || 0) + 9 * 3600e3);
    return '<div class="card sug-a" data-id="' + esc(x.id) + '"><div class="row"><span class="chip ' + s.cls + '">' + s.emoji + ' ' + esc(s.name) + '</span><span class="chip">' + esc(x.category) + '</span>' + who +
      '<span class="spacer"></span><span class="muted small">' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '</span></div>' +
      '<h3 style="margin:8px 0 4px">' + esc(x.title) + '</h3><p style="white-space:pre-wrap;margin:0 0 8px">' + esc(x.body) + '</p>' +
      '<div class="row"><label class="small" style="font-weight:700">状態</label><select data-sst style="width:auto">' + S.SUG_STATUS.map(function (o) { return '<option value="' + o.id + '"' + (o.id === x.status ? ' selected' : '') + '>' + o.emoji + ' ' + esc(o.name) + '</option>'; }).join('') + '</select>' +
      '<label class="small row" style="gap:4px;margin-left:8px"><input type="checkbox" data-spub' + (x.public ? ' checked' : '') + '> 採用したものを全員に紹介する</label></div>' +
      '<label class="f">本人への返事（本人に見えます）</label><textarea data-srep rows="2" maxlength="400" placeholder="例）ありがとう！来月から試してみます。">' + esc(x.reply || '') + '</textarea>' +
      '<div class="row" style="margin-top:6px"><span class="muted small">' + (x.repliedAt ? '返事ずみ' : '') + '</span><span class="spacer"></span><button class="btn small" data-ssave>保存して本人に反映</button></div></div>';
  }
  function renderIdeas() {
    var v = document.getElementById('view'), all = (st.sugs || []).slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    var f = st.sugFilter || 'all', list = f === 'all' ? all : all.filter(function (x) { return x.status === f; });
    var cnt = function (id) { return all.filter(function (x) { return x.status === id; }).length; };
    v.innerHTML = '<div class="card"><h2>💡 社員からの提案</h2><p class="muted small" style="margin-top:0">自己評価とは別に、社員が書いた意見・アイデアです。状態を決めて返事を書くと、本人に届きます。「採用」にして紹介にチェックを入れると、みんなのマイページに「実現したこと」として出ます（匿名の提案は名前を出しません）。</p>' +
      '<div class="cats"><button class="catbtn' + (f === 'all' ? ' on' : '') + '" data-f="all">すべて ' + all.length + '</button>' + S.SUG_STATUS.map(function (o) { return '<button class="catbtn' + (f === o.id ? ' on' : '') + '" data-f="' + o.id + '">' + o.emoji + ' ' + esc(o.name) + ' ' + cnt(o.id) + '</button>'; }).join('') + '</div></div>' +
      (list.map(sugRow).join('') || '<div class="card muted">該当する提案はありません。</div>');
    v.onclick = async function (e) {
      var fb = e.target.closest('[data-f]'); if (fb) { st.sugFilter = fb.dataset.f; renderIdeas(); return; }
      var sv = e.target.closest('[data-ssave]'); if (!sv) return;
      var box = sv.closest('.sug-a'), x = st.sugs.filter(function (y) { return y.id === box.dataset.id; })[0];
      var status = box.querySelector('[data-sst]').value, reply = box.querySelector('[data-srep]').value.trim(), pub = box.querySelector('[data-spub]').checked;
      if (status === 'declined' && !reply) return UI.toast('見送りのときは、理由か感謝のひとことを書いてください');
      if (status === 'new' && reply) status = 'reading';
      if (pub && status !== 'adopted') pub = false;
      var now = Date.now(), data = Object.assign({}, x, { status: status, reply: reply, public: pub, updatedAt: now });
      if (reply && reply !== x.reply) data.repliedAt = now;
      sv.disabled = true;
      try { await Store.saveSuggestion(x.id, data); Object.assign(x, data); updateDot(); UI.toast('保存しました。本人のマイページに反映されます'); renderIdeas(); }
      catch (er) { sv.disabled = false; UI.toast('保存できませんでした：' + window.AuthUI.errText(er)); }
    };
  }

  /* ---------------- 社員名簿 ---------------- */
  function renderStaff() {
    var v = document.getElementById('view');
    function row(s, isNew) {
      return '<tr data-new="' + (isNew ? 1 : 0) + '"><td>' + (isNew ? '<input type="email" data-f="email" placeholder="name@example.com">' : '<span data-f="email">' + esc(s.email) + '</span>') + '</td>' +
        '<td><input type="text" data-f="name" value="' + esc(s.name || '') + '" placeholder="氏名"></td>' +
        '<td><div class="deptchecks" data-f="depts">' + DEPTS.map(function (d) { return '<label class="dchk"><input type="checkbox" data-dept="' + esc(d) + '"' + (S.deptsOf(s).indexOf(d) >= 0 ? ' checked' : '') + '> ' + esc(d) + '</label>'; }).join('') +
        '<button type="button" class="stamp" data-alld>全部署</button><button type="button" class="stamp" data-nod>なし</button></div></td>' +
        '<td><select data-f="role"><option value="employee"' + (s.role !== 'admin' ? ' selected' : '') + '>一般</option><option value="admin"' + (s.role === 'admin' ? ' selected' : '') + '>管理者</option></select></td>' +
        '<td style="text-align:center"><input type="checkbox" data-f="active"' + (s.active !== false ? ' checked' : '') + '></td><td><button class="btn small" data-save>' + (isNew ? '追加' : '保存') + '</button></td></tr>';
    }
    v.innerHTML = '<div class="card"><h2>👥 社員名簿</h2><p class="muted small">ここに登録したメールアドレスで本人がログインすると、<b>部署の評価表</b>が自動で出ます。兼務の人は、部署を<b>複数</b>チェックしてください（評価表が1つにまとまって出ます）。「全部署」ボタンで、すべての部署をまとめて選べます。メールアドレスは本人がログインに使うものと同じにしてください。<br>退職・休職などは「有効」のチェックを外すと、ログインできなくなります（評価データは残ります）。</p>' +
      '<div class="tbl-wrap"><table><thead><tr><th>メールアドレス</th><th>氏名</th><th>部署（兼務は複数）</th><th>権限</th><th>有効</th><th></th></tr></thead><tbody>' +
      row({ role: 'employee' }, true) + st.staffList.sort(function (a, b) { return a.email < b.email ? -1 : 1; }).map(function (s) { return row(s, false); }).join('') + '</tbody></table></div></div>';
    v.onclick = async function (e) {
      var all = e.target.closest('[data-alld]'), none = e.target.closest('[data-nod]');
      if (all || none) { (all || none).closest('.deptchecks').querySelectorAll('[data-dept]').forEach(function (c) { c.checked = !!all; }); return; }
      var b = e.target.closest('[data-save]'); if (!b) return;
      var tr = b.closest('tr'), g = function (f) { return tr.querySelector('[data-f="' + f + '"]'); };
      var isNew = tr.dataset.new === '1', email = String(isNew ? g('email').value : g('email').textContent).trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return UI.toast('メールアドレスを正しく入力してください');
      if (!g('name').value.trim()) return UI.toast('氏名を入力してください');
      var rec = { email: email, name: g('name').value.trim(), depts: DEPTS.filter(function (d) { return tr.querySelector('[data-dept="' + d + '"]').checked; }), role: g('role').value, active: g('active').checked };
      if (email === st.user.email && (rec.role !== 'admin' || !rec.active)) return UI.toast('自分自身の管理者権限・有効状態は変更できません');
      try { await Store.saveStaff(rec); st.staffList = await Store.listStaff(); UI.toast(isNew ? '追加しました' : '保存しました'); renderStaff(); }
      catch (er) { UI.toast('保存できませんでした：' + window.AuthUI.errText(er)); }
    };
  }

  /* ---------------- 評価期間（半年） ---------------- */
  function renderPeriods() {
    var jn = new Date(S.nowMs() + 9 * 3600e3), y = jn.getUTCFullYear(), mo = jn.getUTCMonth() + 1;
    // 入力欄の初期値は「今日をふくむ半年」（4〜9月＝上期、10〜3月＝下期。1〜3月は前年の下期）
    var dHalf = (mo >= 4 && mo <= 9) ? 1 : 2, dYear = mo <= 3 ? y - 1 : y, dMonth = dHalf === 1 ? 4 : 10;
    var v = document.getElementById('view');
    v.innerHTML = '<div class="card"><h2>🗓 評価期間（半年に1回）</h2><p class="muted small">1期間は6か月です。期間が「受付中」のあいだ、社員は<b>毎月1回の自己評価</b>と<b>半年の目標</b>を入力できます（月の自己評価は、その月のうちだけ）。管理者評価は期間の終わりに行います。期間が重ならないように作ってください。</p>' +
      '<div class="row"><select id="py" style="width:auto">' + [y - 1, y, y + 1].map(function (n) { return '<option' + (n === dYear ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select>年' +
      '<select id="ph" style="width:auto"><option value="1"' + (dHalf === 1 ? ' selected' : '') + '>上期</option><option value="2"' + (dHalf === 2 ? ' selected' : '') + '>下期</option></select>' +
      '<label class="small" for="pm">開始月</label><select id="pm" style="width:auto">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (n) { return '<option value="' + n + '"' + (n === dMonth ? ' selected' : '') + '>' + n + '月</option>'; }).join('') + '</select>から6か月' +
      '<button class="btn small" id="padd">期間を作る（受付中で開始）</button></div></div>' +
      '<div class="card tbl-wrap"><table><thead><tr><th>期間</th><th>月</th><th>状態</th><th></th></tr></thead><tbody>' + st.periods.map(function (p) {
        return '<tr><td><b>' + esc(p.label) + '</b><div class="muted small">' + esc(p.id) + '</div></td><td>' + S.monthLabel(p.startYm, true) + ' 〜 ' + S.monthLabel(p.endYm, true) + '</td><td>' + (p.status === 'open' ? '<span class="chip ok">受付中</span>' : '<span class="chip gray">受付終了</span>') + '</td><td><button class="btn sub small" data-tog="' + esc(p.id) + '">' + (p.status === 'open' ? '受付を終了する' : '受付を再開する') + '</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    var ph = document.getElementById('ph'), pm = document.getElementById('pm');
    ph.onchange = function () { pm.value = ph.value === '1' ? 4 : 10; };
    document.getElementById('padd').onclick = async function () {
      var yy = +document.getElementById('py').value, hh = ph.value, mm = +pm.value, startYm = yy + '-' + (mm < 10 ? '0' : '') + mm, endYm = S.addMonths(startYm, 5), id = yy + '-H' + hh;
      if (periodObj(id)) return UI.toast('その期間はすでにあります');
      var overlap = st.periods.filter(function (p) { return !(endYm < p.startYm || startYm > p.endYm); })[0];
      if (overlap) return UI.toast('「' + overlap.label + '」（' + overlap.startYm + '〜' + overlap.endYm + '）と月が重なっています');
      try {
        await Store.savePeriod({ id: id, label: yy + '年 ' + (hh === '1' ? '上期' : '下期'), startYm: startYm, endYm: endYm, startAt: S.ymStartMs(startYm), endAt: S.ymStartMs(S.addMonths(startYm, 6)), status: 'open', createdAt: Date.now() });
        st.periods = await Store.listPeriods(); if (!st.period) st.period = id; await loadPeriod(); UI.toast('作成しました'); renderPeriods();
      } catch (e) { UI.toast(window.AuthUI.errText(e)); }
    };
    v.onclick = async function (e) {
      var b = e.target.closest('[data-tog]'); if (!b) return;
      var p = periodObj(b.dataset.tog), next = p.status === 'open' ? 'closed' : 'open';
      try { await Store.savePeriod(Object.assign({}, p, { status: next })); st.periods = await Store.listPeriods(); renderPeriods(); }
      catch (er) { UI.toast(window.AuthUI.errText(er)); }
    };
  }

  /* ---------------- 起動 ---------------- */
  window.AuthUI.start({
    root: 'app', admin: true,
    onReady: async function (user, staff) {
      st = { user: user, staff: staff, tab: 'list' };
      try { await loadAll(); renderShell(); render(); }
      catch (e) { app.innerHTML = '<div class="wrap"><div class="msg err">読み込みに失敗しました：' + esc(window.AuthUI.errText(e)) + '</div></div>'; }
    }
  });
})();
