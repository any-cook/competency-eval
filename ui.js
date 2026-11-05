/* 画面部品（SVGリング・レーダー・折れ線・ステージの道・紙吹雪など） */
(function () {
  var S = window.Scoring;
  var UI = {};

  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var esc = UI.esc;

  UI.toast = function (msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2400);
  };

  UI.confetti = function () {
    var colors = ['#ee6f8f', '#ffb25b', '#7bbf6a', '#5b9cfa', '#f0c53a', '#c58bf0'];
    for (var i = 0; i < 46; i++) {
      var c = document.createElement('i'); c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = (1.8 + Math.random() * 1.8) + 's';
      c.style.animationDelay = (Math.random() * .5) + 's';
      c.style.borderRadius = i % 3 ? '2px' : '50%';
      document.body.appendChild(c);
      setTimeout((function (el) { return function () { el.remove(); }; })(c), 4500);
    }
  };

  UI.modal = function (html, onClose) {
    var bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    function close() { bg.remove(); if (onClose) onClose(); }
    bg.addEventListener('click', function (e) { if (e.target === bg || e.target.closest('[data-close]')) close(); });
    document.body.appendChild(bg);
    return { el: bg, close: close };
  };

  /** 円形の達成率 */
  UI.ring = function (pct, color, label, size) {
    size = size || 120; var r = size / 2 - 10, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
    return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + esc(label || '') + ' ' + pct + '%">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="#f1e9e6" stroke-width="12"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>' +
      '<text x="50%" y="48%" text-anchor="middle" font-size="' + size * 0.24 + '" font-weight="800" fill="' + color + '">' + pct + '%</text>' +
      '<text x="50%" y="66%" text-anchor="middle" font-size="' + size * 0.1 + '" fill="#8a7b7b">' + esc(label || '') + '</text></svg>';
  };

  /** ステージの道（今どこにいるか） */
  UI.stagePath = function (currentId) {
    return '<div class="path">' + S.STAGES.map(function (s) {
      var cls = s.id < currentId ? 'done' : (s.id === currentId ? 'now' : '');
      return '<div class="st ' + cls + '"><span class="em">' + s.emoji + '</span>' + esc(s.name) + '</div>';
    }).join('') + '</div>';
  };

  /** 区分別の棒グラフ（平均点 1〜4） */
  UI.categoryBars = function (stats, prevStats) {
    return stats.map(function (c) {
      var pct = c.avg == null ? 0 : Math.round(c.avg / 4 * 100);
      var prev = prevStats && prevStats.filter(function (p) { return p.cat === c.cat; })[0];
      var diff = (c.avg != null && prev && prev.avg != null) ? c.avg - prev.avg : null;
      var d = diff == null ? '' : (diff > 0.04 ? ' <span class="gap-up">▲ ' + diff.toFixed(1) + '</span>' : (diff < -0.04 ? ' <span class="gap-down">▼ ' + Math.abs(diff).toFixed(1) + '</span>' : ''));
      return '<div class="cat-row"><div class="top"><span>' + esc(c.cat) + '</span><span><b>' + (c.avg == null ? '—' : c.avg.toFixed(1)) + '</b>' + d +
        ' <span class="muted">（「自立」以上 ' + c.mastered + '/' + c.total + '）</span></span></div><div class="bar"><i style="width:' + pct + '%"></i></div></div>';
    }).join('');
  };

  /** レーダーチャート。series: [{label,color,values:[avg|null...]}] */
  UI.radar = function (cats, series) {
    var n = cats.length; if (n < 3) return '';
    var W = 480, H = 320, cx = W / 2, cy = H / 2 + 6, R = 100;
    function pt(i, v) { var a = -Math.PI / 2 + 2 * Math.PI * i / n, r = R * (v / 4); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
    var g = '';
    [1, 2, 3, 4].forEach(function (lv) {
      g += '<polygon points="' + cats.map(function (_, i) { return pt(i, lv).join(','); }).join(' ') + '" fill="none" stroke="#eadfdc" stroke-width="1"/>';
    });
    cats.forEach(function (c, i) {
      var p = pt(i, 4), lp = pt(i, 4.75), anchor = lp[0] < cx - 8 ? 'end' : (lp[0] > cx + 8 ? 'start' : 'middle');
      var short = c.length > 14 ? c.slice(0, 13) + '…' : c;
      g += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0] + '" y2="' + p[1] + '" stroke="#eadfdc"/>' +
        '<text x="' + lp[0] + '" y="' + (lp[1] + 4) + '" font-size="13" text-anchor="' + anchor + '" fill="#6b5d5d">' + esc(short) + '</text>';
    });
    series.forEach(function (s) {
      var pts = s.values.map(function (v, i) { return pt(i, v == null ? 0 : v).join(','); }).join(' ');
      g += '<polygon points="' + pts + '" fill="' + s.color + '" fill-opacity=".18" stroke="' + s.color + '" stroke-width="2.5"' + (s.dash ? ' stroke-dasharray="5 4"' : '') + '/>';
    });
    var legend = '<div class="legend">' + series.map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + esc(s.label) + '</span>'; }).join('') + '</div>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:520px;display:block;margin:0 auto" role="img" aria-label="区分別のバランス">' + g + '</svg>' + legend;
  };

  /** 折れ線（半年ごとの歩み）。points: [{label, v}] */
  UI.line = function (points, color) {
    if (!points.length) return '';
    var W = 360, H = 170, padL = 34, padR = 16, padT = 16, padB = 34, n = points.length;
    function x(i) { return n === 1 ? W / 2 : padL + (W - padL - padR) * i / (n - 1); }
    function y(v) { return padT + (H - padT - padB) * (1 - (v - 1) / 3); }
    var g = '';
    [1, 2, 3, 4].forEach(function (lv) { g += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(lv) + '" y2="' + y(lv) + '" stroke="#f0e4e0"/><text x="' + (padL - 8) + '" y="' + (y(lv) + 4) + '" font-size="10" text-anchor="end" fill="#999">' + lv + '</text>'; });
    var pts = points.filter(function (p) { return p.v != null; });
    var path = points.map(function (p, i) { return p.v == null ? null : x(i) + ',' + y(p.v); }).filter(Boolean).join(' ');
    g += '<polyline points="' + path + '" fill="none" stroke="' + color + '" stroke-width="3" stroke-linejoin="round"/>';
    points.forEach(function (p, i) {
      if (p.v == null) return;
      g += '<circle cx="' + x(i) + '" cy="' + y(p.v) + '" r="5.5" fill="#fff" stroke="' + color + '" stroke-width="3"/>' +
        '<text x="' + x(i) + '" y="' + (y(p.v) - 10) + '" font-size="11" font-weight="700" text-anchor="middle" fill="' + color + '">' + p.v.toFixed(2) + '</text>';
    });
    points.forEach(function (p, i) { g += '<text x="' + x(i) + '" y="' + (H - 10) + '" font-size="10.5" text-anchor="middle" fill="#6b5d5d">' + esc(p.label) + '</text>'; });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:460px;display:block;margin:0 auto" role="img" aria-label="平均点の推移">' + g + '</svg>';
  };

  /** ステージのヒーロー表示 */
  UI.stageHero = function (avg, scoredCount, caption) {
    var st = S.stageFor(avg);
    if (!st) {
      return '<div class="hero"><div class="big-emoji">' + S.STAGES[0].emoji + '</div><div><div class="stage-label">' + esc(caption) + '</div><p class="stage-name">まだ、はじまる前</p><p class="muted">自己評価を入力すると、あなたの「' + S.TERM + '」がここに育ちます。</p></div></div>';
    }
    var nx = S.nextStage(avg, scoredCount), pct = S.percent(avg);
    var next = nx && nx.next
      ? '<div class="small" style="margin-top:10px">次の「' + nx.next.emoji + ' ' + esc(nx.next.name) + '」まで あと <b>平均 ' + nx.remaining.toFixed(2) + '</b>' +
        (nx.steps ? '（目安：あと <b>' + nx.steps + '項目</b> を1段階アップ）' : '') + '</div><div class="bar" style="margin-top:6px"><i style="width:' + Math.round(nx.ratio * 100) + '%"></i></div>'
      : '<div class="small" style="margin-top:10px">🎉 いちばん上の' + S.TERM + 'です！これからは、まわりの成長も支える立場に。</div>';
    return '<div class="hero"><div class="big-emoji" aria-hidden="true">' + st.emoji + '</div><div style="flex:1;min-width:0">' +
      '<div class="stage-label">' + esc(caption) + '</div><p class="stage-name" style="color:' + st.color + '">' + esc(st.name) + '<span class="muted" style="font-size:.85rem;font-weight:600"> ／ 平均 ' + avg.toFixed(2) + '</span></p>' +
      '<p class="muted" style="margin:0">' + esc(st.msg) + '</p>' + next + '</div>' +
      '<div class="hide-sm">' + UI.ring(pct, st.color, '習熟度', 108) + '</div></div>';
  };

  window.UI = UI;
})();
