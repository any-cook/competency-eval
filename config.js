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
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  }
};
