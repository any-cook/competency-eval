const test = require('node:test');
const assert = require('node:assert');
const S = require('../scoring.js');
S.useSet('sodachi');

const items = [
  { no: 1, cat: 'A', name: 'a1' }, { no: 2, cat: 'A', name: 'a2' },
  { no: 3, cat: 'B', name: 'b1' }, { no: 4, cat: 'B', name: 'b2' }
];

test('平均は対象外(0)と未入力を含めない', () => {
  assert.strictEqual(S.average(items, { 1: 3, 2: 0, 3: 4 }), 3.5);
  assert.strictEqual(S.average(items, {}), null);
  assert.strictEqual(S.average(items, { 1: 0 }), null);
});

test('入力状況: 対象外も回答済みに数える', () => {
  assert.deepStrictEqual(S.progress(items, { 1: 3, 2: 0 }), { answered: 2, total: 4, scored: 1 });
});

test('ステージ境界', () => {
  assert.strictEqual(S.stageFor(null), null);
  assert.strictEqual(S.stageFor(1.0).name, 'たね');
  assert.strictEqual(S.stageFor(1.49).name, 'たね');
  assert.strictEqual(S.stageFor(1.5).name, 'め');
  assert.strictEqual(S.stageFor(2.25).name, 'わかば');
  assert.strictEqual(S.stageFor(2.84).name, 'わかば');
  assert.strictEqual(S.stageFor(2.85).name, 'はな');
  assert.strictEqual(S.stageFor(3.5).name, 'みのり');
  assert.strictEqual(S.stageFor(4).name, 'みのり');
});

test('全項目「自立(3)」ならはな。全員が最低でもたね', () => {
  assert.strictEqual(S.stageFor(3).name, 'はな');
  assert.strictEqual(S.stageFor(S.average(items, { 1: 1, 2: 1, 3: 1, 4: 1 })).name, 'たね');
});

test('次のステージまでの項目数の目安', () => {
  // 平均2.0(わかば手前=め) 4項目 → 次は2.25。0.25*4=1項目
  const n = S.nextStage(2.0, 4);
  assert.strictEqual(n.current.name, 'め');
  assert.strictEqual(n.next.name, 'わかば');
  assert.strictEqual(n.steps, 1);
  assert.ok(n.ratio > 0 && n.ratio < 1);
  // 最上位は next なし
  assert.strictEqual(S.nextStage(3.9, 10).next, null);
});

test('区分別集計', () => {
  const r = S.categoryStats(items, { 1: 3, 2: 4, 3: 2 });
  assert.strictEqual(r[0].cat, 'A');
  assert.strictEqual(r[0].avg, 3.5);
  assert.strictEqual(r[0].mastered, 2);
  assert.strictEqual(r[1].avg, 2);
  assert.strictEqual(r[1].answered, 1);
});

test('前回比・本人と管理者の差', () => {
  assert.deepStrictEqual(S.improvedItems(items, { 1: 3, 2: 2, 3: 4 }, { 1: 2, 2: 2, 3: 3 }).map(i => i.no), [1, 3]);
  assert.deepStrictEqual(S.gaps(items, { 1: 3, 2: 4, 3: 0 }, { 1: 2, 2: 4, 3: 3 }), { 1: -1, 2: 0 });
});

test('バッジ', () => {
  const b = S.badges(items, { 1: 4, 2: 3, 3: 3, 4: 3 }, { 1: 3, 2: 3, 3: 3, 4: 3 }).map(x => x.id);
  assert.deepStrictEqual(b.sort(), ['complete', 'growth', 'solo', 'teacher']);
  assert.ok(S.badges(items, { 1: 1 }, null, { perfect: true }).some(x => x.id === 'perfect'));
  assert.ok(S.badges(items, { 1: 1 }, null, { streak: 3 }).some(x => x.id === 'streak'));
  assert.deepStrictEqual(S.badges(items, { 1: 1 }, null), []);
});

test('呼び名セット: 5段階のセットはしきい値が共通、切り替えできる', () => {
  S.SET_NAMES.filter(n => n !== 'level').forEach(n => {
    S.useSet(n);
    assert.strictEqual(S.STAGES.length, 5);
    assert.deepStrictEqual(S.STAGES.map(x => x.min), [0, 1.5, 2.25, 2.85, 3.5]);
    assert.ok(S.TERM);
  });
  S.useSet('curry'); assert.strictEqual(S.stageFor(3).name, 'あじわい');
  S.useSet('nonexistent'); assert.strictEqual(S.SET_NAME, 'level');
  S.useSet('sodachi');
});

test('月の計算は日本時間: UTC 10/31 15:00 はもう11月', () => {
  assert.strictEqual(S.ymOf(Date.UTC(2026, 9, 31, 14, 59, 59)), '2026-10');
  assert.strictEqual(S.ymOf(Date.UTC(2026, 9, 31, 15, 0, 0)), '2026-11');
  assert.strictEqual(S.ymOf(Date.UTC(2026, 11, 31, 15, 0, 0)), '2027-01');
});

test('月初(JST)のミリ秒・月の加減算・範囲', () => {
  assert.strictEqual(S.ymStartMs('2026-11'), Date.UTC(2026, 9, 31, 15, 0, 0));
  assert.strictEqual(S.addMonths('2026-11', 2), '2027-01');
  assert.strictEqual(S.addMonths('2026-01', -1), '2025-12');
  assert.deepStrictEqual(S.monthRange('2026-10', '2027-03'), ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
  assert.strictEqual(S.lastDay('2027-02'), 28);
  assert.strictEqual(S.lastDay('2028-02'), 29);
  assert.strictEqual(S.monthLabel('2026-11'), '11月');
});

test('月末までの残り日数', () => {
  assert.strictEqual(S.daysLeftInMonth(Date.UTC(2026, 10, 29, 0, 0)), 2); // 11/29 9:00 JST → 29,30日
  assert.strictEqual(S.daysLeftInMonth(Date.UTC(2026, 10, 30, 14, 59)), 1); // 11/30 23:59 JST
});

test('期間の判定とさかのぼり不可の月ステータス', () => {
  const periods = [{ id: '2026-H2', startYm: '2026-10', endYm: '2027-03' }];
  assert.strictEqual(S.periodForYm(periods, '2026-12').id, '2026-H2');
  assert.strictEqual(S.periodForYm(periods, '2027-04'), null);
  const sub = { status: 'submitted', scores: { 1: 3 } };
  assert.strictEqual(S.monthStatus('2026-10', '2026-12', sub), 'submitted');
  assert.strictEqual(S.monthStatus('2026-11', '2026-12', null), 'missed');
  assert.strictEqual(S.monthStatus('2026-11', '2026-12', { status: 'draft', scores: { 1: 3 } }), 'missed'); // 下書きのまま月が変わったら期限切れ
  assert.strictEqual(S.monthStatus('2026-12', '2026-12', null), 'current');
  assert.strictEqual(S.monthStatus('2026-12', '2026-12', { status: 'draft', scores: { 1: 3 } }), 'draft');
  assert.strictEqual(S.monthStatus('2027-01', '2026-12', null), 'future');
});

test('連続提出月数', () => {
  const d = (ym) => ({ [ym]: { status: 'submitted' } });
  const m = Object.assign({}, d('2026-09'), d('2026-10'), d('2026-11'));
  assert.strictEqual(S.streak(m, '2026-11'), 3);
  assert.strictEqual(S.streak(m, '2026-12'), 3); // 今月まだ未提出でも先月までの連続は数える
  assert.strictEqual(S.streak(m, '2027-01'), 0); // 12月を飛ばしたら途切れる
  assert.strictEqual(S.streak({}, '2026-11'), 0);
});

test('目標: 達成度と最新の進捗', () => {
  const goals = [{ id: 1 }, { id: 2 }];
  assert.strictEqual(S.goalAchievement(goals, { 1: 4, 2: 2 }), 75);
  assert.strictEqual(S.goalAchievement(goals, {}), null);
  const docs = [{ ym: '2026-10', goalProgress: { 1: 25 } }, { ym: '2026-11', goalProgress: { 1: 50 } }, { ym: '2026-12', goalProgress: {} }];
  assert.deepStrictEqual(S.latestGoalProgress(1, docs), { ym: '2026-11', v: 50 });
  assert.strictEqual(S.latestGoalProgress(2, docs), null);
});

test('あいさつ・季節・名前・返信まわり', () => {
  const at = (iso) => Date.parse(iso);
  assert.equal(S.greeting(at('2026-11-05T08:00:00+09:00')).text, 'おはようございます');
  assert.equal(S.greeting(at('2026-11-05T13:00:00+09:00')).text, 'こんにちは');
  assert.equal(S.greeting(at('2026-11-05T20:00:00+09:00')).text, 'おつかれさまです');
  assert.equal(S.greeting(at('2026-11-04T16:30:00Z')).text, 'おつかれさまです'); // JST 1:30
  assert.equal(S.seasonEmoji(at('2026-04-10T12:00:00+09:00')), '🌸');
  assert.equal(S.seasonEmoji(at('2026-07-10T12:00:00+09:00')), '🌻');
  assert.equal(S.seasonEmoji(at('2026-11-10T12:00:00+09:00')), '🍁');
  assert.equal(S.seasonEmoji(at('2027-01-10T12:00:00+09:00')), '⛄');
  // 同じ日（日本時間）なら同じ文、翌日は変わる
  assert.equal(S.dailyMessage(at('2026-11-05T00:10:00+09:00')), S.dailyMessage(at('2026-11-05T23:50:00+09:00')));
  assert.notEqual(S.dailyMessage(at('2026-11-05T12:00:00+09:00')), S.dailyMessage(at('2026-11-06T12:00:00+09:00')));
  assert.equal(S.givenName('製造 花子'), '花子');
  assert.equal(S.givenName('福士　太郎'), '太郎');
  assert.equal(S.givenName('さくら'), 'さくら');
  assert.equal(S.cleanReviewer('福士（管理者）'), '福士');
  assert.equal(S.cleanReviewer('福士'), '福士');
});

test('本人の記載（ひとこと・コメント・目標メモ）の判定', () => {
  assert.equal(S.hasWriting(null), false);
  assert.equal(S.hasWriting({ memo: '  ', comments: { 1: '' }, goalNotes: {} }), false);
  assert.equal(S.hasWriting({ memo: '相談したい' }), true);
  assert.equal(S.hasWriting({ comments: { 3: '一人で任されました' } }), true);
  assert.equal(S.hasWriting({ goalNotes: { 1: 'つまずき中' } }), true);
});

test('部署の兼務：複数部署の評価項目をまとめる', () => {
  const all = { 製造部: [{ no: 1, cat: 'A', name: 'x' }, { no: 2, cat: 'A', name: 'y' }], 営業部: [{ no: 1, cat: 'A', name: 'z' }], 経理部: [{ no: 1, cat: 'B', name: 'w' }] };
  assert.deepEqual(S.deptsOf({ dept: '製造部' }), ['製造部']);
  assert.deepEqual(S.deptsOf({ dept: '製造部', depts: ['製造部', '営業部'] }), ['製造部', '営業部']);
  assert.deepEqual(S.deptsOf({ dept: '', depts: [] }), []);
  assert.equal(S.deptLabel({ depts: ['製造部', '営業部'] }), '製造部・営業部');
  const one = S.itemsForDepts(all, ['営業部']);
  assert.equal(one.length, 1); assert.equal(one[0].no, 101); assert.equal(one[0].dispNo, 1); assert.equal(one[0].cat, 'A');
  const many = S.itemsForDepts(all, ['営業部', '製造部']); // 並び順は部署の固定順
  assert.deepEqual(many.map(i => i.no), [1, 2, 101]);
  assert.equal(new Set(many.map(i => i.no)).size, 3); // 番号は重ならない
  assert.equal(many[0].cat, '製造部／A'); assert.equal(many[2].cat, '営業部／A'); // 兼務のときは区分に部署名が付く
  assert.equal(S.itemsForDepts(all, []).length, 0);
  const all3 = S.itemsForDepts(all, ['製造部', '営業部', '経理部']);
  assert.deepEqual(all3.map(i => i.no), [1, 2, 101, 201]);
});

test('10段階の「レベル」：見習いから、エニクックになくてはならない存在まで', () => {
  S.useSet('level');
  assert.strictEqual(S.TERM, 'レベル');
  assert.strictEqual(S.STAGES.length, 10);
  assert.deepStrictEqual(S.STAGES.map(x => x.min), [0, 1.3, 1.6, 1.9, 2.2, 2.5, 2.8, 3.1, 3.4, 3.7]);
  assert.strictEqual(S.STAGES[0].name, '見習い');
  assert.strictEqual(S.STAGES[9].name, 'エニクックになくてはならない存在');
  assert.strictEqual(S.STAGES[5].title, 'Lv.6　一人前');
  assert.ok(S.STAGES.every(x => x.desc && x.msg && x.emoji && x.color));
  assert.strictEqual(S.stageFor(1.0).name, '見習い');
  assert.strictEqual(S.stageFor(1.29).name, '見習い');
  assert.strictEqual(S.stageFor(1.3).name, '新人');
  assert.strictEqual(S.stageFor(2.5).name, '一人前');
  assert.strictEqual(S.stageFor(3).name, '頼れる存在'); // 全項目「自立」(3点)
  assert.strictEqual(S.stageFor(3.69).name, 'みんなの先生');
  assert.strictEqual(S.stageFor(3.7).name, 'エニクックになくてはならない存在');
  assert.strictEqual(S.stageFor(4).lv, 10);
  assert.strictEqual(S.nextStage(3.9, 10).next, null);
  const n = S.nextStage(2.0, 10); // Lv.4(1.9〜) → Lv.5(2.2)
  assert.strictEqual(n.current.name, '戦力'); assert.strictEqual(n.next.name, 'もうすぐ一人前');
  assert.ok(Math.abs(n.remaining - 0.2) < 1e-9);
  S.useSet('sodachi');
});

test('できる部署の認定と称号', () => {
  assert.deepStrictEqual(S.certifiedOf({ certified: ['製造部', '製造部', ''] }), ['製造部']);
  assert.deepStrictEqual(S.certifiedOf({}), []);
  assert.strictEqual(S.certTitle(0, 3), null);
  assert.strictEqual(S.certTitle(1, 3).name, '部署マスター');
  assert.strictEqual(S.certTitle(2, 3).name, '二刀流');
  assert.strictEqual(S.certTitle(3, 3).name, 'オールラウンダー');
  assert.strictEqual(S.certTitle(2, 2).name, 'オールラウンダー');
});

test('目標の達成判定とふりかえり', () => {
  const goals = [{ id: 1, title: 'a' }, { id: 2, title: 'b', doneYm: '2026-11' }, { id: 3, title: 'c' }];
  const docs = [{ ym: '2026-10', goalProgress: { 1: 50, 3: 100 } }, { ym: '2026-11', goalProgress: { 1: 75 } }];
  assert.deepStrictEqual(S.goalState(goals[0], docs), { cleared: false, ym: null, v: 75 });
  assert.deepStrictEqual(S.goalState(goals[1], docs), { cleared: true, ym: '2026-11', v: 100 });
  assert.strictEqual(S.goalState(goals[2], docs).cleared, true);
  const r = S.goalReview(goals, docs);
  assert.strictEqual(r.total, 3); assert.strictEqual(r.cleared, 2);
  assert.deepStrictEqual(S.goalReview([], docs), { total: 0, cleared: 0, list: [] });
});
