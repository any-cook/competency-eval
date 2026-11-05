// Firestoreルールのテスト（エミュレータ使用）。実行: npm run test:rules
// 時刻に依存しないよう、「今月」「先月」「来月」はこのテストを実行した時刻から計算します。
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const firebase = require('firebase/compat/app'); require('firebase/compat/firestore');
const fs = require('fs');
const path = require('path');

const JST = 9 * 3600 * 1000;
const Ts = firebase.firestore.Timestamp;
function monthStartMs(offset) { // 日本時間の月初 0:00（offset=0 今月, -1 先月, 1 来月）
  const d = new Date(Date.now() + JST); const t = d.getUTCFullYear() * 12 + d.getUTCMonth() + offset;
  return Date.UTC(Math.floor(t / 12), t % 12, 1) - JST;
}
function ymOf(ms) { const d = new Date(ms + JST); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
const THIS = monthStartMs(0), LAST = monthStartMs(-1), NEXT = monthStartMs(1);

(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-ce', firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await d.doc('staff/admin@x.jp').set({ email: 'admin@x.jp', name: 'A', dept: '', role: 'admin', active: true });
    await d.doc('staff/seizo@x.jp').set({ email: 'seizo@x.jp', name: 'S', dept: '製造部', role: 'employee', active: true });
    await d.doc('staff/eigyo@x.jp').set({ email: 'eigyo@x.jp', name: 'E', dept: '営業部', role: 'employee', active: true });
    await d.doc('staff/old@x.jp').set({ email: 'old@x.jp', name: 'O', dept: '製造部', role: 'employee', active: false });
    // 先月〜来月をふくむ受付中の期間 / 終了した期間
    await d.doc('periods/P-open').set({ id: 'P-open', status: 'open', startAt: Ts.fromMillis(LAST), endAt: Ts.fromMillis(monthStartMs(5)) });
    await d.doc('periods/P-closed').set({ id: 'P-closed', status: 'closed', startAt: Ts.fromMillis(LAST), endAt: Ts.fromMillis(monthStartMs(5)) });
    await d.doc('periods/P-old').set({ id: 'P-old', status: 'open', startAt: Ts.fromMillis(monthStartMs(-8)), endAt: Ts.fromMillis(monthStartMs(-2)) });
    await d.doc(`monthlyEvals/${ymOf(THIS)}__eigyo@x.jp`).set({ ym: ymOf(THIS), period: 'P-open', email: 'eigyo@x.jp', dept: '営業部', monthStart: Ts.fromMillis(THIS), status: 'draft', scores: {} });
    await d.doc('mgrEvals/P-open__seizo@x.jp').set({ period: 'P-open', email: 'seizo@x.jp', released: false, scores: { 1: 4 } });
    await d.doc('mgrEvals/P-closed__seizo@x.jp').set({ period: 'P-closed', email: 'seizo@x.jp', released: true, scores: { 1: 3 } });
  });
  const as = (email, verified = true) => env.authenticatedContext('u-' + email, { email, email_verified: verified }).firestore();
  const mo = (e, over = {}, start = THIS) => ({ ym: ymOf(start), period: 'P-open', email: e, name: 'S', dept: '製造部', monthStart: Ts.fromMillis(start), scores: { 1: 3 }, comments: {}, goalProgress: {}, goalNotes: {}, memo: '', status: 'draft', updatedAt: 1, ...over });
  const mid = (start, e) => `monthlyEvals/${ymOf(start)}__${e}`;
  const goal = (e, over = {}) => ({ period: 'P-open', email: e, name: 'S', dept: '製造部', goals: [{ id: 1, title: 'a', action: 'b' }], status: 'draft', updatedAt: 1, ...over });
  let n = 0; const t = async (name, p) => { await p; n++; console.log('ok -', name); };

  const seizo = as('seizo@x.jp'), admin = as('admin@x.jp'), eigyo = as('eigyo@x.jp');
  const anon = env.unauthenticatedContext().firestore();

  // --- 名簿・期間 ---
  await t('未ログインは名簿を読めない', assertFails(anon.doc('staff/seizo@x.jp').get()));
  await t('メール未確認は読めない', assertFails(as('seizo@x.jp', false).doc('staff/seizo@x.jp').get()));
  await t('本人は自分の名簿行を読める', assertSucceeds(seizo.doc('staff/seizo@x.jp').get()));
  await t('他人の名簿行は読めない', assertFails(seizo.doc('staff/eigyo@x.jp').get()));
  await t('名簿全件(list)は管理者のみ', assertFails(seizo.collection('staff').get()));
  await t('管理者は名簿全件を読める', assertSucceeds(admin.collection('staff').get()));
  await t('名簿未登録メールも自分の行(存在なし)は取得できる', assertSucceeds(as('nobody@x.jp').doc('staff/nobody@x.jp').get()));
  await t('一般社員は名簿を書けない(権限昇格不可)', assertFails(seizo.doc('staff/seizo@x.jp').set({ email: 'seizo@x.jp', name: 'S', dept: '製造部', role: 'admin', active: true })));
  await t('管理者は名簿を書ける', assertSucceeds(admin.doc('staff/new@x.jp').set({ email: 'new@x.jp', name: 'N', dept: '営業部', role: 'employee', active: true })));
  await t('名簿未登録は期間を読めない', assertFails(as('nobody@x.jp').doc('periods/P-open').get()));
  await t('無効アカウントは期間を読めない', assertFails(as('old@x.jp').doc('periods/P-open').get()));
  await t('社員は期間を読める', assertSucceeds(seizo.doc('periods/P-open').get()));
  await t('社員は期間を書けない', assertFails(seizo.doc('periods/X').set({ id: 'X', status: 'open' })));

  // --- 月次の自己評価：今月だけ ---
  await t('今月分を作れる', assertSucceeds(seizo.doc(mid(THIS, 'seizo@x.jp')).set(mo('seizo@x.jp'))));
  await t('【さかのぼり不可】先月分は作れない', assertFails(seizo.doc(mid(LAST, 'seizo@x.jp')).set(mo('seizo@x.jp', {}, LAST))));
  await t('来月分も作れない', assertFails(seizo.doc(mid(NEXT, 'seizo@x.jp')).set(mo('seizo@x.jp', {}, NEXT))));
  await t('月初でない時刻(月の途中)は拒否', assertFails(seizo.doc(mid(THIS, 'seizo@x.jp')).set(mo('seizo@x.jp', { monthStart: Ts.fromMillis(THIS + 86400000 * 10) }))));
  await t('他人名義では作れない', assertFails(seizo.doc(mid(THIS, 'eigyo@x.jp')).set(mo('eigyo@x.jp'))));
  await t('他人の月次は読めない(get)', assertFails(seizo.doc(mid(THIS, 'eigyo@x.jp')).get()));
  await t('他人の月次は一覧でも読めない', assertFails(seizo.collection('monthlyEvals').where('email', '==', 'eigyo@x.jp').get()));
  await t('自分の月次は一覧で読める', assertSucceeds(seizo.collection('monthlyEvals').where('email', '==', 'seizo@x.jp').get()));
  await t('絞り込みなしの全件取得は不可', assertFails(seizo.collection('monthlyEvals').get()));
  await t('部署を偽れない', assertFails(seizo.doc(mid(THIS, 'seizo@x.jp')).set(mo('seizo@x.jp', { dept: '営業部' }))));
  await t('余計なフィールドは付けられない', assertFails(seizo.doc(mid(THIS, 'seizo@x.jp')).set(mo('seizo@x.jp', { mgrScore: 4 }))));
  await t('終了した期間には書けない', assertFails(seizo.doc(mid(THIS, 'seizo@x.jp')).set(mo('seizo@x.jp', { period: 'P-closed' }))));
  await t('期間の範囲外の月には書けない', assertFails(seizo.doc(mid(THIS, 'seizo@x.jp')).set(mo('seizo@x.jp', { period: 'P-old' }))));
  await t('提出できる', assertSucceeds(seizo.doc(mid(THIS, 'seizo@x.jp')).set(mo('seizo@x.jp', { status: 'submitted', submittedAt: 2 }))));
  await t('提出後は本人が変更できない', assertFails(seizo.doc(mid(THIS, 'seizo@x.jp')).set(mo('seizo@x.jp', { scores: { 1: 4 } }))));
  await t('管理者は差し戻せる', assertSucceeds(admin.doc(mid(THIS, 'seizo@x.jp')).set(mo('seizo@x.jp', { status: 'draft' }))));
  await t('差し戻し後は(同じ月なら)再編集できる', assertSucceeds(seizo.doc(mid(THIS, 'seizo@x.jp')).set(mo('seizo@x.jp', { scores: { 1: 4 } }))));
  await t('管理者は期間の全月次を読める', assertSucceeds(admin.collection('monthlyEvals').where('period', '==', 'P-open').get()));

  // --- 半年の目標 ---
  await t('目標を下書き保存できる', assertSucceeds(seizo.doc('goals/P-open__seizo@x.jp').set(goal('seizo@x.jp'))));
  await t('目標は6個以上にできない', assertFails(seizo.doc('goals/P-open__seizo@x.jp').set(goal('seizo@x.jp', { goals: [1, 2, 3, 4, 5, 6].map(i => ({ id: i, title: 'a', action: 'b' })) }))));
  await t('目標を確定できる', assertSucceeds(seizo.doc('goals/P-open__seizo@x.jp').set(goal('seizo@x.jp', { status: 'fixed', fixedAt: 3 }))));
  await t('確定後は本人が変更できない', assertFails(seizo.doc('goals/P-open__seizo@x.jp').set(goal('seizo@x.jp', { goals: [{ id: 1, title: 'x', action: 'y' }] }))));
  await t('他人の目標は読めない', assertFails(eigyo.doc('goals/P-open__seizo@x.jp').get()));
  await t('終了した期間の目標は書けない', assertFails(seizo.doc('goals/P-closed__seizo@x.jp').set(goal('seizo@x.jp', { period: 'P-closed' }))));
  await t('管理者は目標を差し戻せる', assertSucceeds(admin.doc('goals/P-open__seizo@x.jp').set(goal('seizo@x.jp', { status: 'draft' }))));

  // --- 管理者評価 ---
  await t('未公開の管理者評価は本人が読めない(get)', assertFails(seizo.doc('mgrEvals/P-open__seizo@x.jp').get()));
  await t('公開済みの管理者評価は本人が読める', assertSucceeds(seizo.doc('mgrEvals/P-closed__seizo@x.jp').get()));
  await t('本人は公開済みのみ一覧で読める', assertSucceeds(seizo.collection('mgrEvals').where('email', '==', 'seizo@x.jp').where('released', '==', true).get()));
  await t('released条件なしの一覧は不可(未公開が漏れない)', assertFails(seizo.collection('mgrEvals').where('email', '==', 'seizo@x.jp').get()));
  await t('他人の管理者評価は読めない', assertFails(eigyo.doc('mgrEvals/P-closed__seizo@x.jp').get()));
  await t('本人は管理者評価を書き換えられない', assertFails(seizo.doc('mgrEvals/P-closed__seizo@x.jp').set({ period: 'P-closed', email: 'seizo@x.jp', released: true, scores: { 1: 4 } })));
  await t('管理者は管理者評価を書ける', assertSucceeds(admin.doc('mgrEvals/P-open__seizo@x.jp').set({ period: 'P-open', email: 'seizo@x.jp', released: true, scores: { 1: 4 } })));
  await t('公開後は本人が読める', assertSucceeds(seizo.doc('mgrEvals/P-open__seizo@x.jp').get()));

  // --- ひとこと返信 ---
  const rid = `replies/${ymOf(THIS)}__seizo@x.jp`;
  const rep = (over = {}) => ({ ym: ymOf(THIS), period: 'P-open', email: 'seizo@x.jp', name: 'S', text: 'ありがとう', seen: true, reviewer: '福士', createdAt: 1, updatedAt: 1, ...over });
  await t('本人は返信を書けない', assertFails(seizo.doc(rid).set(rep())));
  await t('他の人は返信を書けない', assertFails(eigyo.doc(rid).set(rep())));
  await t('管理者は返信を書ける', assertSucceeds(admin.doc(rid).set(rep())));
  await t('301字の返信は書けない', assertFails(admin.doc(rid).set(rep({ text: 'あ'.repeat(301) }))));
  await t('書類IDと違う月・宛先は書けない', assertFails(admin.doc(rid).set(rep({ ym: '2000-01' }))));
  await t('本人は自分宛ての返信を読める', assertSucceeds(seizo.doc(rid).get()));
  await t('本人は自分宛ての返信を一覧で読める', assertSucceeds(seizo.collection('replies').where('email', '==', 'seizo@x.jp').get()));
  await t('他人宛ての返信は読めない', assertFails(eigyo.doc(rid).get()));
  await t('条件なしの一覧は不可', assertFails(seizo.collection('replies').get()));
  await t('管理者は期間の返信を一覧で読める', assertSucceeds(admin.collection('replies').where('period', '==', 'P-open').get()));
  await t('本人は既読(readAt)だけ付けられる', assertSucceeds(seizo.doc(rid).update({ readAt: 5 })));
  await t('本人は返信の文章を書き換えられない', assertFails(seizo.doc(rid).update({ text: '改ざん' })));
  await t('本人は readAt と一緒に文章を変えられない', assertFails(seizo.doc(rid).update({ readAt: 6, text: '改ざん' })));
  await t('他人は既読にできない', assertFails(eigyo.doc(rid).update({ readAt: 5 })));
  await t('本人は返信を消せない', assertFails(seizo.doc(rid).delete()));
  await t('管理者は返信を書き直せる', assertSucceeds(admin.doc(rid).set(rep({ text: '書き直し', updatedAt: 2 }))));

  // --- 提案ボックス ---
  const sg = (e, over = {}) => ({ id: 'sg1', email: e, name: 'S', dept: '製造部', anonymous: false, category: '仕事のやり方', title: '提案', body: '本文', status: 'new', reply: '', public: false, createdAt: 1, updatedAt: 1, ...over });
  await t('本人は提案を投稿できる', assertSucceeds(seizo.doc('suggestions/sg1').set(sg('seizo@x.jp'))));
  await t('他人名義では投稿できない', assertFails(eigyo.doc('suggestions/sg2').set(sg('seizo@x.jp', { id: 'sg2' }))));
  await t('最初から「採用・公開」にはできない', assertFails(seizo.doc('suggestions/sg3').set(sg('seizo@x.jp', { id: 'sg3', status: 'adopted', public: true }))));
  await t('返事を自分で書いて投稿はできない', assertFails(seizo.doc('suggestions/sg4').set(sg('seizo@x.jp', { id: 'sg4', reply: 'OK' }))));
  await t('601字の本文は投稿できない', assertFails(seizo.doc('suggestions/sg5').set(sg('seizo@x.jp', { id: 'sg5', body: 'あ'.repeat(601) }))));
  await t('空のタイトルは投稿できない', assertFails(seizo.doc('suggestions/sg6').set(sg('seizo@x.jp', { id: 'sg6', title: '' }))));
  await t('分類がリスト外なら投稿できない', assertFails(seizo.doc('suggestions/sg7').set(sg('seizo@x.jp', { id: 'sg7', category: 'なんでも' }))));
  await t('投稿ずみの提案は本人が書き換えられない', assertFails(seizo.doc('suggestions/sg1').set(sg('seizo@x.jp', { status: 'adopted', public: true }))));
  await t('本人は自分の提案を読める', assertSucceeds(seizo.collection('suggestions').where('email', '==', 'seizo@x.jp').get()));
  await t('他人の非公開の提案は読めない', assertFails(eigyo.doc('suggestions/sg1').get()));
  await t('条件なしの一覧は不可', assertFails(eigyo.collection('suggestions').get()));
  await t('管理者は全件読める', assertSucceeds(admin.collection('suggestions').get()));
  await t('管理者は状態・返事・公開を決められる', assertSucceeds(admin.doc('suggestions/sg1').set(sg('seizo@x.jp', { status: 'adopted', reply: 'ありがとう', public: true, repliedAt: 2 }))));
  await t('公開された提案は他の社員も読める', assertSucceeds(eigyo.collection('suggestions').where('public', '==', true).get()));
  await t('採用ずみの提案は本人でも取り下げできない', assertFails(seizo.doc('suggestions/sg1').delete()));
  await seizo.doc('suggestions/sg8').set(sg('seizo@x.jp', { id: 'sg8' }));
  await t('受付ずみなら本人が取り下げできる', assertSucceeds(seizo.doc('suggestions/sg8').delete()));
  await t('名簿にないメールは投稿できない', assertFails(as('nobody@x.jp').doc('suggestions/sg9').set(sg('nobody@x.jp', { id: 'sg9' }))));
  console.log('\nALL PASSED:', n);
  await env.cleanup();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
