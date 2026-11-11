/* 個人目標シート（会社の「個人目標フォーマット」をそのまま画面にしたもの）
 *  ・本人が入力（受付中の期間のあいだ）。管理者は閲覧
 *  ・月の欄は、その期間の6か月ぶん
 */
(function () {
  var S = window.Scoring, UI = window.UI, esc = UI.esc;

  var TEXT_KEYS = ['group', 'regret', 'good', 'mindsetWork', 'mindsetCost', 'bonji', 'lifeHome', 'lifeCompany', 'lifeChallenge'];
  function blankRow(kind) {
    var r = { name: '', purpose: '', detail: '', prog: [null, null, null], plan: {}, act: {} };
    r[kind === 'work' ? 'date' : 'due'] = '';
    return r;
  }
  function blank() {
    var s = { works: [blankRow('work'), blankRow('work'), blankRow('work')], skills: [blankRow('skill'), blankRow('skill'), blankRow('skill')] };
    TEXT_KEYS.forEach(function (k) { s[k] = ''; });
    return s;
  }
  /** 保存データを、画面で使える形に整える（足りない項目を補う） */
  function normalize(d) {
    var s = blank();
    if (!d) return s;
    TEXT_KEYS.forEach(function (k) { if (typeof d[k] === 'string') s[k] = d[k]; });
    ['works', 'skills'].forEach(function (key) {
      var kind = key === 'works' ? 'work' : 'skill';
      for (var i = 0; i < 3; i++) {
        var src = (d[key] || [])[i]; if (!src) continue;
        var r = blankRow(kind);
        ['name', 'purpose', 'detail', 'date', 'due'].forEach(function (f) { if (typeof src[f] === 'string' && f in r) r[f] = src[f]; });
        if (Array.isArray(src.prog)) r.prog = [0, 1, 2].map(function (k) { var v = src.prog[k]; return PROG_VALUES.indexOf(v) >= 0 ? v : null; });
        r.plan = src.plan && typeof src.plan === 'object' ? src.plan : {};
        r.act = src.act && typeof src.act === 'object' ? src.act : {};
        s[key][i] = r;
      }
    });
    return s;
  }
  function isEmpty(d) {
    var s = normalize(d);
    return !TEXT_KEYS.some(function (k) { return s[k].trim(); }) && !['works', 'skills'].some(function (key) {
      return s[key].some(function (r) { return r.name.trim() || r.purpose.trim() || r.detail.trim(); });
    });
  }

  /* ---- 画面の部品 ---- */
  var CLS = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
  var PROG_VALUES = [0, 25, 50, 75, 100];
  function field(ro, path, label, val, o) {
    o = o || {};
    var h = '<label class="f">' + esc(label) + '</label>';
    if (ro) return h + '<div class="gs-ro' + (val ? '' : ' empty') + '">' + (val ? esc(val) : '（未入力）') + '</div>';
    if (o.area) return h + '<textarea data-p="' + path + '" rows="' + (o.rows || 3) + '" maxlength="' + (o.max || 600) + '" placeholder="' + esc(o.ph || '') + '">' + esc(val) + '</textarea>';
    return h + '<input type="text" data-p="' + path + '" maxlength="' + (o.max || 100) + '" value="' + esc(val) + '" placeholder="' + esc(o.ph || '') + '">';
  }
  function monthGrid(ro, base, row, months) {
    return '<div class="gs-months">' + months.map(function (ym) {
      function tg(kind, label) {
        var on = !!(row[kind] && row[kind][ym]);
        return '<button type="button" class="gs-tg ' + kind + (on ? ' on' : '') + '" data-tg="' + base + '.' + kind + '.' + ym + '"' + (ro ? ' disabled' : '') + '>' + label + (on ? ' ●' : '') + '</button>';
      }
      return '<div class="gs-m"><div class="mm">' + esc(S.monthLabel(ym)) + '</div>' + tg('plan', '計画') + tg('act', '実績') + '</div>';
    }).join('') + '</div>';
  }
  /** Ⅰ・Ⅱ・Ⅲ：期ごと（2か月ずつ）に「どこまでできているか」を記録する */
  function progBox(ro, base, row, months) {
    return '<div class="gs-prog"><div class="small muted">期ごとの到達度（どこまでできているか）</div><div class="gs-prog-grid">' + CLS.map(function (c, i) {
      var a = months[i * 2], b = months[i * 2 + 1], v = row.prog[i];
      var term = esc(c) + '期' + (a ? '<span class="small muted">（' + esc(S.monthLabel(a)) + (b ? '〜' + esc(S.monthLabel(b)) : '') + '）</span>' : '');
      var opts = '<option value="">—</option>' + PROG_VALUES.map(function (x) {
        var lb = S.GOAL_PROGRESS.filter(function (g) { return g.v === x; })[0].label;
        return '<option value="' + x + '"' + (v === x ? ' selected' : '') + '>' + x + '% ' + esc(lb) + '</option>';
      }).join('');
      var val = v == null ? '（未入力）' : v + '%　' + S.GOAL_PROGRESS.filter(function (g) { return g.v === v; })[0].label;
      return '<div class="gs-pg"><div class="gs-pgh">' + term + '</div>' + (ro ? '<div class="gs-ro' + (v == null ? ' empty' : '') + '">' + val + '</div>' : '<select data-pg="' + base + '.prog.' + i + '">' + opts + '</select>') +
        (ro ? '' : '<div class="bar" style="margin:4px 0 0"><i style="width:' + (v || 0) + '%"></i></div>') + '</div>';
    }).join('') + '</div></div>';
  }
  function rowCard(ro, key, i, row, months) {
    var work = key === 'works', base = key + '.' + i;
    return '<div class="gs-row"><div class="row"><b>№ ' + (i + 1) + '</b></div>' +
      '<div class="grid2">' +
      '<div>' + field(ro, base + '.name', work ? '業務名' : '技術・能力項目', row.name, { max: 60, ph: work ? '例）レトルト充填工程の管理' : '例）殺菌工程の温度管理' }) + '</div>' +
      '<div>' + field(ro, base + (work ? '.date' : '.due'), work ? '実施日' : '期限', work ? row.date : row.due, { max: 40, ph: work ? '例）毎週月曜' : '例）3月末まで' }) + '</div></div>' +
      field(ro, base + '.purpose', work ? '仕事の目的' : '目的', row.purpose, { area: 1, rows: 2, max: 300 }) +
      field(ro, base + '.detail', work ? '仕事の細目及び進め方' : '向上の方法及び進め方', row.detail, { area: 1, rows: 3, max: 500 }) +
      '<div class="small muted" style="margin-top:8px">月ごとの計画と実績（タップで●をつけます）</div>' + monthGrid(ro, base, row, months) + progBox(ro, base, row, months) + '</div>';
  }

  /** シート全体のHTML。ro=true なら読むだけ */
  function html(sheet, months, ro, who) {
    var s = normalize(sheet);
    var h = '<div class="gsheet">' +
      '<div class="card"><h2>📝 個人目標シート</h2>' +
      '<p class="muted small" style="margin:0">' + (ro ? '本人が書いたシートです。' : '会社の「個人目標フォーマット」です。書けるところから、少しずつ入力してください（自動で保存されます）。内容は管理者が見られます。') + '</p>' +
      '<div class="grid2">' + '<div>' + field(ro, 'group', 'グループ', s.group, { max: 40 }) + '</div><div><label class="f">氏名</label><div class="gs-ro">' + esc(who || '') + '</div></div></div></div>' +

      '<div class="card"><h3 class="gs-h">私の受け持っている仕事<span class="small muted">（目的追求、目標達成に対する貢献は）</span></h3>' +
      '<div class="gs-sub">《部門重点課題に対する行動・自分の役割》</div>' + s.works.map(function (r, i) { return rowCard(ro, 'works', i, r, months); }).join('') + '</div>' +

      '<div class="card"><div class="gs-sub">《独自で発揮する技術・能力（スキル）向上目標》</div>' + s.skills.map(function (r, i) { return rowCard(ro, 'skills', i, r, months); }).join('') + '</div>' +

      '<div class="card">' +
      field(ro, 'regret', '＜前期できなかった事の反省＞', s.regret, { area: 1, rows: 3 }) +
      field(ro, 'good', '＜前期によくできた事＞', s.good, { area: 1, rows: 3 }) +
      '<div class="gs-sub" style="margin-top:14px">＜今期の心構え・目標＞</div>' +
      field(ro, 'mindsetWork', '仕事', s.mindsetWork, { area: 1, rows: 2 }) +
      field(ro, 'mindsetCost', 'コスト削減', s.mindsetCost, { area: 1, rows: 2 }) +
      field(ro, 'bonji', '＜凡事徹底／私は次のことを年間を通して実行いたします＞', s.bonji, { area: 1, rows: 3 }) + '</div>' +

      '<div class="card"><div class="gs-sub">＜人生計画 ５ヶ年ビジョン＞（ 夢 ）</div>' +
      field(ro, 'lifeHome', '①どのような家庭環境をつくるのか（住まい、家族環境、家庭貢献）', s.lifeHome, { area: 1, rows: 3 }) +
      field(ro, 'lifeCompany', '②会社で自分はどうありたいのか（職場貢献、地位面、人間性）', s.lifeCompany, { area: 1, rows: 3 }) +
      field(ro, 'lifeChallenge', '③個人のチャレンジ目標（知識、技術取得、資格取得など）', s.lifeChallenge, { area: 1, rows: 3 }) + '</div></div>';
    return h;
  }

  /* ---- 編集：入力を拾って自動保存 ---- */
  function setPath(obj, path, val) {
    var k = path.split('.'), o = obj;
    for (var i = 0; i < k.length - 1; i++) { var key = /^\d+$/.test(k[i]) ? Number(k[i]) : k[i]; if (o[key] == null || typeof o[key] !== 'object') o[key] = {}; o = o[key]; }
    var last = /^\d+$/.test(k[k.length - 1]) ? Number(k[k.length - 1]) : k[k.length - 1];
    if (val === undefined) delete o[last]; else o[last] = val;
  }
  /**
   * el に編集画面を出す。opts: {sheet, months, who, onSave(sheet)->Promise, statusEl}
   * 戻り値: 保存待ちを今すぐ保存する関数
   */
  function edit(el, opts) {
    var sheet = normalize(opts.sheet), timer = null;
    el.innerHTML = html(sheet, opts.months, false, opts.who);
    function status(t) { var s = document.getElementById(opts.statusId || 'gs-status'); if (s) s.textContent = t; }
    async function flush() {
      clearTimeout(timer); timer = null;
      try { await opts.onSave(sheet); status('✓ 保存しました'); }
      catch (e) { status('⚠ 保存できませんでした'); UI.toast(window.AuthUI.errText(e)); }
    }
    function queue() { status('保存中…'); clearTimeout(timer); timer = setTimeout(flush, 800); }
    el.oninput = function (e) {
      var p = e.target.getAttribute && e.target.getAttribute('data-p'); if (!p) return;
      setPath(sheet, p, e.target.value); queue();
    };
    el.onchange = function (e) {
      var c = e.target.getAttribute && e.target.getAttribute('data-pg'); if (!c) return;
      var v = e.target.value === '' ? null : Number(e.target.value);
      setPath(sheet, c, v); queue();
      var bar = e.target.parentNode.querySelector('.bar i'); if (bar) bar.style.width = (v || 0) + '%';
    };
    el.onclick = function (e) {
      var b = e.target.closest && e.target.closest('[data-tg]'); if (!b || b.disabled) return;
      var path = b.getAttribute('data-tg'), on = !b.classList.contains('on');
      setPath(sheet, path, on ? true : undefined);
      var kind = /\.plan\./.test(path) ? '計画' : '実績';
      b.classList.toggle('on', on); b.textContent = kind + (on ? ' ●' : ''); queue();
    };
    return flush;
  }

  /** 印刷用の別ウィンドウ */
  function print(sheet, months, who, title) {
    var w = window.open('', '_blank'); if (!w) return UI.toast('印刷用の画面を開けませんでした。ポップアップを許可してください');
    w.document.write('<!doctype html><meta charset="utf-8"><title>' + esc(title || '個人目標シート') + '</title><style>' +
      'body{font-family:sans-serif;margin:16px;color:#222}h2,h3{margin:8px 0}.card{border:1px solid #bbb;border-radius:6px;padding:8px 12px;margin:8px 0;page-break-inside:avoid}' +
      '.f{display:block;font-size:12px;color:#555;margin-top:8px}.gs-ro{white-space:pre-wrap;border-bottom:1px solid #ddd;padding:2px 0;min-height:1.2em}.gs-ro.empty{color:#aaa}' +
      '.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}.row{display:flex;gap:8px;align-items:center}.spacer{flex:1}.small{font-size:12px}.muted{color:#666}' +
      '.gs-months{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-top:4px}.gs-m{border:1px solid #ccc;text-align:center;font-size:12px}.gs-m .mm{background:#f2f2f2}' +
      '.gs-prog-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.gs-pg{border:1px solid #ccc;padding:4px 6px}.gs-pgh{font-weight:bold}.gs-tg{display:block;width:100%;border:0;border-top:1px solid #ddd;background:#fff;font-size:12px;padding:3px}.gs-tg.on{background:#ffe3ea;font-weight:bold}.gs-sub{font-weight:bold;margin:6px 0}' +
      '</style>' + html(sheet, months, true, who) + '<script>window.onload=function(){window.print()}<\/script>');
    w.document.close();
  }

  window.GoalSheet = { blank: blank, normalize: normalize, isEmpty: isEmpty, html: html, edit: edit, print: print };
})();
