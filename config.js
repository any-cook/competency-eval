// ★ここに Firebase コンソールの「プロジェクトの設定 > マイアプリ（ウェブ）」の値を貼り付けてください。
//   apiKey が空のあいだは自動的に「デモモード」（ブラウザ内のダミーデータ）で動きます。
//   ※ 他システム（タイムカード等）とは別の、新しい Firebase プロジェクトを使ってください（README参照）。
window.APP_CONFIG = {
  appName: '成長ノート',
  companyName: 'エニクック',
  // 成長の段階の呼び名（どれか1つ）。しきい値は共通で、画面の言葉だけが変わります。
  //   'curry'   … 🧅しこみ中 → 🔥いため → 🍲にこみ → 🍛あじわい → ✨看板の味（呼び名「仕上がり」）
  //   'sodachi' … 🌰たね → 🌱め → 🌿わかば → 🌸はな → 🌾みのり（呼び名「育ち」）
  //   'akari'   … 🕯️ともしび → 🌙つきあかり → ⭐ほしあかり → 🌟きらめき → ☀️かがやき（呼び名「あかり」）
  stageSet: 'curry',
  firebase: {
    apiKey: 'AIzaSyCEaskX6wd9cN6AU6dwMCSwLoDvUikmuQE',
    authDomain: 'competency-eval-ebc6f.firebaseapp.com',
    projectId: 'competency-eval-ebc6f',
    storageBucket: 'competency-eval-ebc6f.firebasestorage.app',
    messagingSenderId: '155755765055',
    appId: '1:155755765055:web:4896fbcbcb74735a51478a'
  }
};
