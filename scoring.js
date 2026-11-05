/* 採点・育ち（段階）判定・月/期間の計算（画面・Firebaseに依存しない）
 * 点数: 1=要支援(×) 2=補助(△) 3=自立(〇) 4=熟練・指導(◎) / 0=対象外（平均に含めない）/ 未入力=キー無し
 * 段階の呼び名は config.js の stageSet で切り替え（level=10段階のレベル[標準] / curry / sodachi / akari=5段階）。
 * 月は日本時間(JST)で数える。ym = 'YYYY-MM'
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Scoring = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var NA = 0;
  var JST = 9 * 3600 * 1000;

  var LEVELS = [
    { score: 1, mark: '×', name: '要支援', short: 'まだ一人では難しい。指示やサポートが必要',
      original: '一人での接客や商品説明は不可。質問されると答えられず、常にサポート・指示が必要。' },
    { score: 2, mark: '△', name: '補助', short: '基本はできるが、細かい確認や判断にサポートが必要',
      original: '定型的な商品説明やレジ操作はできるが、アレルゲン等の詳細確認、試食設営、積極的な声かけにはサポートが必要。' },
    { score: 3, mark: '〇', name: '自立', short: '指示がなくても、一人で正確にやり遂げられる',
      original: '指示がなくても自力で正確な商品知識・衛生管理のもと、質の高い接客・試食販売・陳列・会計・在庫管理を一人で完結できる。' },
    { score: 4, mark: '◎', name: '熟練・指導', short: '工夫や改善ができ、後輩に教えたり提案もできる',
      original: '顧客の反応に応じた売り場づくりやトークの工夫ができ、売上目標を達成するとともに、新人の店頭指導や販促企画の提案ができる。' }
  ];

  // 目標の進み具合（本人が毎月つける）と、半年末の達成度（管理者がつける）
  var GOAL_PROGRESS = [
    { v: 0, label: 'これから' }, { v: 25, label: '少し進んだ' }, { v: 50, label: '半分' },
    { v: 75, label: 'あと少し' }, { v: 100, label: 'できた！' }
  ];
  var GOAL_LEVELS = [
    { score: 1, name: 'まだこれから', short: 'あまり進められなかった' },
    { score: 2, name: '途中まで', short: '一部は達成できた' },
    { score: 3, name: '達成', short: '目標どおり達成できた' },
    { score: 4, name: '期待以上', short: '目標以上の成果が出た' }
  ];
  var MAX_GOALS = 1; // 取り組み中の目標は同時にひとつ。達成したら次の目標を立てる

  // 段階の呼び名セット（min = 平均点がこれ以上でその段階）
  var THRESHOLDS = [0, 1.5, 2.25, 2.85, 3.5];
  var COLORS = ['#b98a5e', '#7bbf6a', '#3fa66b', '#ec7fa0', '#e0a526'];
  function mk(term, rows, th, cols, lv) {
    th = th || THRESHOLDS; cols = cols || COLORS;
    return { term: term, stages: rows.map(function (r, i) {
      return { id: i + 1, min: th[i], emoji: r[0], name: r[1], color: cols[i], msg: r[2], desc: r[3] || '',
        title: lv ? 'Lv.' + (i + 1) + '　' + r[1] : r[1], lv: lv ? i + 1 : 0 };
    }) };
  }
  // 10段階（平均点を0.3刻み）：見習い → エニクックになくてはならない存在
  var TH10 = [0, 1.3, 1.6, 1.9, 2.2, 2.5, 2.8, 3.1, 3.4, 3.7];
  var COL10 = ['#a8927f', '#8fb06a', '#6fb56a', '#4fae7a', '#3fa6a0', '#4f9bd0', '#7b86e0', '#b36fd6', '#ec6f9a', '#e0a526'];
  var SETS = {
    // 標準：仕事の力そのものを言葉にした10段階（料理などのたとえは使わない）
    level: mk('レベル', [
      ['🔰', '見習い', 'ここからスタートです。教わりながら、一つずつできることを増やしていきましょう。', '教わりながら、見て覚えている'],
      ['🌱', '新人', 'まわりのサポートを受けながら、着実に力がついています。', '手順を見ながら、作業を進められる'],
      ['🌿', '準戦力', '補助があれば、通常の作業ができるようになりました。自信をもって次の一歩へ。', '補助があれば、通常の作業ができる'],
      ['🍀', '戦力', 'かんたんな作業は一人で任せられます。できる仕事が増えています。', 'かんたんな作業は一人でできる'],
      ['🌳', 'もうすぐ一人前', '通常の作業の半分は一人でできます。一人前まで、あと少しです。', '通常の作業の半分は一人でできる'],
      ['⭐', '一人前', '通常の作業はほぼ一人でできます。立派な一人前です。', '通常の作業はほぼ一人でできる'],
      ['🌟', '頼れる存在', '一人で安定してできて、まわりにも頼られています。', '一人で安定してでき、まわりに頼られる'],
      ['💫', 'チームの柱', '応用もできて、トラブルにも対応できます。チームを支える柱です。', '応用ができ、トラブルにも対応できる'],
      ['🏅', 'みんなの先生', 'まわりに教え、仕事を引っ張っています。みんなの成長も支えています。', 'まわりに教え、仕事を引っ張れる'],
      ['👑', 'エニクックになくてはならない存在', 'あなたの力が、エニクックの力そのものです。いつもありがとうございます。', '手本であり、会社になくてはならない力']
    ], TH10, COL10, true),
    // 案A：植物の育ち
    sodachi: mk('育ち', [
      ['🌰', 'たね', 'ここから育っていく準備ができました。一つずつ、できることを増やしていきましょう。'],
      ['🌱', 'め', '芽が出ました。まわりのサポートを受けながら、着実に力がついています。'],
      ['🌿', 'わかば', '基本の仕事を任せられる段階です。自信をもって、次の一歩へ。'],
      ['🌸', 'はな', '一人でやり切れる力が花開きました。得意を伸ばして、まわりにも広げましょう。'],
      ['🌾', 'みのり', 'たくさんの実りです。あなたの力が、チームの力になっています。']
    ]),
    // 案B：カレーづくり（エニクックらしい呼び名）
    curry: mk('仕上がり', [
      ['🧅', 'しこみ中', '材料がそろい、これから味が育っていきます。ひとつずつ、できることを増やしましょう。'],
      ['🔥', 'いため', 'いい香りがしてきました。サポートを受けながら、着実に力がついています。'],
      ['🍲', 'にこみ', 'じっくり味がなじんできました。基本の仕事を任せられる段階です。'],
      ['🍛', 'あじわい', 'ごはんにかけたくなる味に。一人でやり切れる力がついています。'],
      ['✨', '看板の味', 'お店の看板になる味です。あなたの力が、チームの力になっています。']
    ]),
    // 案C：あかり
    akari: mk('あかり', [
      ['🕯️', 'ともしび', '小さな灯がともりました。ここから少しずつ、明るくなっていきます。'],
      ['🌙', 'つきあかり', 'やさしい光が広がっています。まわりの支えを力に、進んでいきましょう。'],
      ['⭐', 'ほしあかり', '基本の仕事を任せられる、頼れる光になってきました。'],
      ['🌟', 'きらめき', '一人でやり切れる力がきらめいています。得意をまわりにも広げましょう。'],
      ['☀️', 'かがやき', 'まわりを照らす存在です。あなたの力が、チームの力になっています。']
    ])
  };
  var SET_NAMES = Object.keys(SETS);

  var STAGES, TERM, SET_NAME;

  function isScored(v) { return typeof v === 'number' && v >= 1 && v <= 4; }

  function progress(items, scores) {
    scores = scores || {};
    var answered = 0, scored = 0;
    items.forEach(function (it) {
      var v = scores[it.no];
      if (v === NA || isScored(v)) answered++;
      if (isScored(v)) scored++;
    });
    return { answered: answered, total: items.length, scored: scored };
  }
  function average(items, scores) {
    scores = scores || {};
    var sum = 0, n = 0;
    items.forEach(function (it) { var v = scores[it.no]; if (isScored(v)) { sum += v; n++; } });
    return n ? sum / n : null;
  }
  function percent(avg) { return avg == null ? 0 : Math.round(avg / 4 * 100); }
  function stageFor(avg) {
    if (avg == null) return null;
    var cur = STAGES[0];
    STAGES.forEach(function (s) { if (avg >= s.min - 1e-9) cur = s; });
    return cur;
  }
  function nextStage(avg, scoredCount) {
    var cur = stageFor(avg);
    if (!cur) return null;
    var next = STAGES.filter(function (s) { return s.id === cur.id + 1; })[0];
    if (!next) return { current: cur, next: null };
    var ratio = Math.max(0, Math.min(1, (avg - cur.min) / (next.min - cur.min)));
    var steps = scoredCount ? Math.max(1, Math.ceil((next.min - avg) * scoredCount - 1e-9)) : null;
    return { current: cur, next: next, remaining: next.min - avg, ratio: ratio, steps: steps };
  }
  function categoryStats(items, scores) {
    scores = scores || {};
    var order = [], map = {};
    items.forEach(function (it) {
      if (!map[it.cat]) { map[it.cat] = { cat: it.cat, items: [] }; order.push(it.cat); }
      map[it.cat].items.push(it);
    });
    return order.map(function (c) {
      var g = map[c], avg = average(g.items, scores), p = progress(g.items, scores);
      var mastered = g.items.filter(function (it) { return isScored(scores[it.no]) && scores[it.no] >= 3; }).length;
      return { cat: c, avg: avg, total: g.items.length, answered: p.answered, scored: p.scored, mastered: mastered };
    });
  }
  function masteredCount(items, scores) {
    scores = scores || {};
    return items.filter(function (it) { return isScored(scores[it.no]) && scores[it.no] >= 3; }).length;
  }
  function improvedItems(items, now, prev) {
    now = now || {}; prev = prev || {};
    return items.filter(function (it) { return isScored(now[it.no]) && isScored(prev[it.no]) && now[it.no] > prev[it.no]; });
  }
  function gaps(items, self, mgr) {
    self = self || {}; mgr = mgr || {};
    var out = {};
    items.forEach(function (it) { if (isScored(self[it.no]) && isScored(mgr[it.no])) out[it.no] = mgr[it.no] - self[it.no]; });
    return out;
  }

  /* ---------- 月・期間（日本時間） ---------- */
  function nowMs() {
    var o = typeof window !== 'undefined' && window.__NOW_MS__;
    return o || Date.now();
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymOf(ms) { var d = new Date(ms + JST); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1); }
  function nowYm() { return ymOf(nowMs()); }
  function splitYm(ym) { var a = ym.split('-'); return { y: +a[0], m: +a[1] }; }
  /** その月の1日 0:00（JST）のミリ秒。Firestoreには Timestamp として保存する */
  function ymStartMs(ym) { var p = splitYm(ym); return Date.UTC(p.y, p.m - 1, 1) - JST; }
  function addMonths(ym, n) { var p = splitYm(ym), t = p.y * 12 + (p.m - 1) + n; return Math.floor(t / 12) + '-' + pad(t % 12 + 1); }
  function monthRange(startYm, endYm) {
    var out = [], cur = startYm, guard = 0;
    while (cur <= endYm && guard++ < 24) { out.push(cur); cur = addMonths(cur, 1); }
    return out;
  }
  function monthLabel(ym, withYear) { var p = splitYm(ym); return (withYear ? p.y + '年' : '') + p.m + '月'; }
  /** その月の末日（日） */
  function lastDay(ym) { var p = splitYm(ym); return new Date(Date.UTC(p.y, p.m, 0)).getUTCDate(); }
  /** 今日から月末までの残り日数（今日を含む）。JST */
  function daysLeftInMonth(ms) { var d = new Date(ms + JST); return lastDay(ymOf(ms)) - d.getUTCDate() + 1; }
  function periodForYm(periods, ym) {
    return (periods || []).filter(function (p) { return p.startYm && ym >= p.startYm && ym <= p.endYm; })[0] || null;
  }
  /** submitted / draft(今月入力中) / current(今月未入力) / missed(期限切れ・未提出) / future */
  function monthStatus(ym, nowYmStr, doc) {
    if (doc && doc.status === 'submitted') return 'submitted';
    if (ym > nowYmStr) return 'future';
    if (ym < nowYmStr) return 'missed';
    return doc && Object.keys(doc.scores || {}).length ? 'draft' : 'current';
  }
  /** 連続提出月数（今月が提出済みなら今月から、まだなら先月から数える） */
  function streak(docsByYm, nowYmStr) {
    var cur = nowYmStr, n = 0;
    if (!(docsByYm[cur] && docsByYm[cur].status === 'submitted')) cur = addMonths(cur, -1);
    while (docsByYm[cur] && docsByYm[cur].status === 'submitted' && n < 120) { n++; cur = addMonths(cur, -1); }
    return n;
  }

  /* ---------- 目標 ---------- */
  /** 管理者の目標評価(1〜4)の平均 → 0〜100% */
  function goalAchievement(goals, goalScores) {
    goalScores = goalScores || {};
    var sum = 0, n = 0;
    (goals || []).forEach(function (g) { var v = goalScores[g.id]; if (isScored(v)) { sum += v; n++; } });
    return n ? Math.round(sum / n / 4 * 100) : null;
  }
  /** 月ごとの進捗のうち、いちばん新しい月の値 {ym, v} */
  function latestGoalProgress(goalId, docs) {
    var best = null;
    (docs || []).forEach(function (d) {
      var v = d.goalProgress && d.goalProgress[goalId];
      if (typeof v === 'number' && (!best || d.ym > best.ym)) best = { ym: d.ym, v: v };
    });
    return best;
  }

  function badges(items, scores, prevScores, extra) {
    extra = extra || {};
    var out = [], p = progress(items, scores), sc = scores || {};
    var masters = items.filter(function (it) { return sc[it.no] === 4; }).length;
    var impr = improvedItems(items, scores, prevScores).length;
    var mastered = masteredCount(items, scores), scored = p.scored;
    if (extra.perfect) out.push({ id: 'perfect', emoji: '🏆', name: 'まいつき皆勤', note: '期間中の毎月、自己評価を出しました' });
    else if (extra.streak >= 2) out.push({ id: 'streak', emoji: '🔥', name: 'つづけ上手', note: extra.streak + 'か月連続で提出中' });
    if (p.answered === p.total && p.total > 0) out.push({ id: 'complete', emoji: '✅', name: 'ぜんぶ入力', note: '全項目を振り返りました' });
    if (scored && mastered / scored >= 0.7) out.push({ id: 'solo', emoji: '🏅', name: '一人立ち', note: '7割以上の項目が「自立」以上' });
    if (masters >= 1) out.push({ id: 'teacher', emoji: '🎓', name: 'せんせいバッジ', note: '「熟練・指導」が' + masters + '項目' });
    if (impr >= 1) out.push({ id: 'growth', emoji: '🚀', name: 'ぐんぐん成長', note: '先月より ' + impr + '項目アップ' });
    return out;
  }


  /** 目標のようす：本人が「達成した」を押した(doneYm)か、月の進み具合が100%なら達成ずみ */
  function goalState(g, docs) {
    var lp = latestGoalProgress(g.id, docs);
    if (g.doneYm) return { cleared: true, ym: g.doneYm, v: 100 };
    if (lp && lp.v === 100) return { cleared: true, ym: lp.ym, v: 100 };
    return { cleared: false, ym: null, v: lp ? lp.v : 0 };
  }
  /** 半年ぶんの「立てた目標／達成した目標」 */
  function goalReview(goals, docs) {
    var list = (goals || []).map(function (g) { var s = goalState(g, docs); return { goal: g, cleared: s.cleared, ym: s.ym, v: s.v }; });
    return { total: list.length, cleared: list.filter(function (x) { return x.cleared; }).length, list: list };
  }

  /* ---------------- あいさつ・季節・返信まわり（見た目用） ---------------- */
  var DAILY = [
    '今日の自分に「おつかれさま」を言えたら、それで十分です。',
    'できるようになったことは、小さくても立派な一歩です。',
    'ゆっくりでも、続けていることがいちばんの力です。',
    '「まだ」できないことは、これから伸びるところです。',
    'まわりの人の「ありがとう」は、あなたの仕事の証です。',
    '迷ったら、先輩や上司にひとこと聞いてみましょう。',
    '昨日より少しだけ。それが積み重なると大きな違いになります。',
    '今日は、ひとつ「できたこと」を見つけてみましょう。',
    'がんばりすぎない日があっても大丈夫です。',
    '丁寧な仕事は、ちゃんと誰かに伝わっています。',
    '自分のペースで、ひとつずつ育てていきましょう。',
    '困ったときは、ひとりで抱えずに声をかけてくださいね。',
    '毎月のふりかえりは、未来の自分への手紙です。',
    'あなたの「気づき」が、現場をよくしています。'
  ];
  function jstDate(ms) { return new Date((ms == null ? nowMs() : ms) + JST); }
  /** 時間帯のあいさつ */
  function greeting(ms) {
    var h = jstDate(ms).getUTCHours();
    if (h >= 4 && h < 11) return { text: 'おはようございます', icon: '☀️' };
    if (h >= 11 && h < 17) return { text: 'こんにちは', icon: '🌼' };
    return { text: 'おつかれさまです', icon: '🌙' };
  }
  /** 季節の絵文字（3-5春 6-8夏 9-11秋 12-2冬） */
  function seasonEmoji(ms) {
    var m = jstDate(ms).getUTCMonth() + 1;
    if (m >= 3 && m <= 5) return '🌸';
    if (m >= 6 && m <= 8) return '🌻';
    if (m >= 9 && m <= 11) return '🍁';
    return '⛄';
  }
  /** その日のひとこと（日付で決まる。同じ日は同じ文） */
  function dailyMessage(ms) { return DAILY[Math.floor(((ms == null ? nowMs() : ms) + JST) / 86400000) % DAILY.length]; }
  /** 「製造 花子」→「花子」。空白がなければそのまま */
  function givenName(name) { var t = String(name || '').trim().split(/[\s\u3000]+/); return t[t.length - 1] || ''; }
  /** 「福士（管理者）」→「福士」 */
  function cleanReviewer(name) { return String(name || '').replace(/[（(][^）)]*[）)]/g, '').trim(); }
  /** 提出済みの書類に、本人が何か書いているか（ひとこと・項目コメント・目標メモ） */
  function hasWriting(doc) {
    if (!doc) return false;
    function any(o) { return Object.keys(o || {}).some(function (k) { return String(o[k] || '').trim(); }); }
    return !!String(doc.memo || '').trim() || any(doc.comments) || any(doc.goalNotes);
  }
  var REPLY_MAX = 300;
  /* ---- 部署（兼務に対応：1人が複数の部署を持てる） ---- */
  /** 社員の部署の一覧。depts があればそれ、なければ dept（1つ）から作る */
  function deptsOf(staff) {
    var a = staff && Array.isArray(staff.depts) ? staff.depts.filter(Boolean) : [];
    if (!a.length && staff && staff.dept) a = [staff.dept];
    return a;
  }
  /** 管理者が「できる」と認定した部署（名簿の certified）。担当部署のうち認定済みのものだけ数える */
  function certifiedOf(staff) {
    var a = staff && Array.isArray(staff.certified) ? staff.certified.filter(Boolean) : [];
    return a.filter(function (d, i) { return a.indexOf(d) === i; });
  }
  /** できる部署の数に応じた称号（レベルの上限は変えず、称号だけ増える）。total=会社の部署数 */
  function certTitle(n, total) {
    if (!n) return null;
    if (total >= 2 && n >= total) return { emoji: '🌈', name: 'オールラウンダー', note: '全部の部署をこなせます（' + n + '部署）' };
    if (n >= 3) return { emoji: '🌈', name: 'オールラウンダー', note: n + '部署をこなせます' };
    if (n === 2) return { emoji: '🎪', name: '二刀流', note: '2つの部署をこなせます' };
    return { emoji: '🎯', name: '部署マスター', note: '1つの部署をこなせます' };
  }
  function deptLabel(staff) { return deptsOf(staff).join('・'); }
  /** 部署の評価項目をまとめる。項目番号は部署ごとに100ずつずらして重ならないようにする（製造0・営業100・経理200）。表示用の番号は dispNo */
  function itemsForDepts(all, depts) {
    var order = Object.keys(all || {}), multi = (depts || []).length > 1, out = [];
    order.forEach(function (d, i) {
      if (depts.indexOf(d) < 0) return;
      (all[d] || []).forEach(function (it) {
        out.push(Object.assign({}, it, { dept: d, dispNo: it.no, no: it.no + i * 100, cat: multi ? d + '／' + it.cat : it.cat }));
      });
    });
    return out;
  }
  // 提案ボックス
  var SUG_CATS = ['仕事のやり方', '設備・道具', '職場の環境', '商品・アイデア', '評価制度へのご意見', 'その他'];
  var SUG_STATUS = [
    { id: 'new', name: '受付ずみ', emoji: '📮', cls: 'gray' },
    { id: 'reading', name: '検討中', emoji: '🔍', cls: 'warn' },
    { id: 'adopted', name: '採用されました', emoji: '🎉', cls: 'ok' },
    { id: 'later', name: '今後の課題', emoji: '🌱', cls: '' },
    { id: 'declined', name: '今回は見送り', emoji: '🍃', cls: 'gray' }
  ];
  var SUG_TITLE_MAX = 60, SUG_BODY_MAX = 600;
  function sugStatus(id) { return SUG_STATUS.filter(function (s) { return s.id === id; })[0] || SUG_STATUS[0]; }

  var api = {
    NA: NA, LEVELS: LEVELS, GOAL_PROGRESS: GOAL_PROGRESS, GOAL_LEVELS: GOAL_LEVELS, MAX_GOALS: MAX_GOALS,
    SETS: SETS, SET_NAMES: SET_NAMES,
    isScored: isScored, progress: progress, average: average, percent: percent,
    stageFor: stageFor, nextStage: nextStage, categoryStats: categoryStats,
    masteredCount: masteredCount, improvedItems: improvedItems, gaps: gaps, badges: badges,
    nowMs: nowMs, ymOf: ymOf, nowYm: nowYm, ymStartMs: ymStartMs, addMonths: addMonths, monthRange: monthRange,
    monthLabel: monthLabel, lastDay: lastDay, daysLeftInMonth: daysLeftInMonth, periodForYm: periodForYm,
    greeting: greeting, seasonEmoji: seasonEmoji, dailyMessage: dailyMessage, givenName: givenName, cleanReviewer: cleanReviewer,
    hasWriting: hasWriting, REPLY_MAX: REPLY_MAX, DAILY: DAILY, goalState: goalState, goalReview: goalReview, deptsOf: deptsOf, certifiedOf: certifiedOf, certTitle: certTitle, deptLabel: deptLabel, itemsForDepts: itemsForDepts,
    SUG_CATS: SUG_CATS, SUG_STATUS: SUG_STATUS, SUG_TITLE_MAX: SUG_TITLE_MAX, SUG_BODY_MAX: SUG_BODY_MAX, sugStatus: sugStatus,
    monthStatus: monthStatus, streak: streak, goalAchievement: goalAchievement, latestGoalProgress: latestGoalProgress
  };
  api.useSet = function (name) {
    if (!SETS[name]) name = 'level';
    SET_NAME = name; STAGES = SETS[name].stages; TERM = SETS[name].term;
    api.STAGES = STAGES; api.TERM = TERM; api.SET_NAME = name;
  };
  api.useSet((typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.stageSet) || 'level');
  return api;
});
