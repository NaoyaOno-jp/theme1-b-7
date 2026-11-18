// =====================================================================
// イキテル  App.js
// データ、状態の判定、変わる文字の書き換え、ボタンの動きを担当する。
// 色や大きさは直接さわらない（例外：#remain-bar-fill の幅だけ）。
//
// ■ 実物のセンサー（中継器）がないので、入力を次のように仮定している
//
//  【入れられた入力】
//   ・トイレの電気がついた／消えたとき、中継器は1件ずつ知らせてくる
//       → receiveLightEvent('on' | 'off')
//   ・中継器は電源が入っている間、10分ごとに「動いている」信号を送ってくる
//       → receiveHeartbeat()
//
//  【切られた入力】
//   ・中継器が抜かれる／停電すると、信号も照明の知らせも届かなくなる
//     （抜かれている間に電気をつけても、アプリには何も届かない）
//   ・最後の信号から30分たっても次が来なければ「電源オフ（灰）」にする
//   ・差し直すと、すぐに信号が届き、元の判定に戻る
//
//  【判定】
//   ・最後の点灯・消灯（または家族の「無事を確認」）から16時間たったら
//     「確認してください（黄）」にして、家族に通知する
// =====================================================================


// ---------------------------------------------------------------------
// 1. 定数（README「6. データ」）
// ---------------------------------------------------------------------
const THRESHOLD_HOURS = 16;      // これを超えたら「確認してください」
const HEARTBEAT_LIMIT_MIN = 30;  // 中継器の信号がこれ以上来なければ「電源オフ」
const HEARTBEAT_EVERY_MIN = 10;  // 中継器が信号を送る間隔（仮定）
const RECORD_SHOW_COUNT = 5;     // 記録を何件まで見せるか

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const STATUS_TEXT = {
  ok:    { label: 'イキテル',                 sub: 'いつもどおり電気が使われています' },
  check: { label: '確認してください',         sub: `${THRESHOLD_HOURS}時間、電気のオン・オフがありません` },
  off:   { label: '機器の電源が切れています', sub: 'プラグが抜けたか、停電の可能性があります' },
};

const EVENT_TEXT = {
  on: '点灯',
  off: '消灯',
  confirm: '家族が確認',
  lost: '中継器の信号が途絶えた',
};


// ---------------------------------------------------------------------
// 2. 時計（デモでは時間を早送りできるように、ずらし幅を持つ）
// ---------------------------------------------------------------------
let demoOffsetMs = 0;

function now() {
  return new Date(Date.now() + demoOffsetMs);
}


// ---------------------------------------------------------------------
// 3. データ（README「6. データ」の形）
// ---------------------------------------------------------------------
const startAt = now();

const state = {
  lastChangeAt: new Date(startAt - 72 * MINUTE),  // 最後に電気がついた・消えた時刻
  lastHeartbeatAt: new Date(startAt),             // 中継器から最後に信号が来た時刻
  confirmedAt: null,                              // 家族が「無事を確認」を押した時刻
  away: false,                                    // 留守中かどうか
  records: [],                                    // { at: Date, event: 'on'|'off'|'confirm'|'lost' }
};

// デモ側だけが知っている「本当の様子」（実物では家の中で起きていること）
const demo = {
  lightIsOn: false,     // トイレの電気
  relayPlugged: true,   // 中継器が差さっているか
};

// 内部の記録用（二重に通知・記録しないため）
let notifiedFor = null;   // どの時刻について通知済みか
let lostRecorded = false; // 「信号が途絶えた」を記録済みか

// 最初のダミーの記録（朝と昼のトイレ）
addRecord(new Date(startAt - 4 * HOUR - 3 * MINUTE), 'on');
addRecord(new Date(startAt - 4 * HOUR), 'off');
addRecord(new Date(startAt - 75 * MINUTE), 'on');
addRecord(new Date(startAt - 72 * MINUTE), 'off');


// ---------------------------------------------------------------------
// 4. 入力の受け取り（実物ができたら、サーバーからのデータをここに渡す）
// ---------------------------------------------------------------------

// 照明の知らせが届いた（入れられた入力）
function receiveLightEvent(event) {
  const at = now();
  state.lastChangeAt = at;
  state.lastHeartbeatAt = at; // 知らせが届いた＝中継器は動いている
  addRecord(at, event);
  render();
}

// 中継器の信号が届いた
function receiveHeartbeat() {
  state.lastHeartbeatAt = now();
}

// 中継器が差さっている間は、定期的に信号が届いたことにする（仮定）
function simulateHeartbeat() {
  if (!demo.relayPlugged) return; // 切られている間は何も届かない
  const sinceLast = now() - state.lastHeartbeatAt;
  if (sinceLast >= HEARTBEAT_EVERY_MIN * MINUTE) receiveHeartbeat();
}


// ---------------------------------------------------------------------
// 5. 状態の決め方（README「computeStatus」）
// ---------------------------------------------------------------------

// 16時間を数え始める時刻：最後の変化と家族の確認の、新しい方
function baseTime() {
  if (state.confirmedAt && state.confirmedAt > state.lastChangeAt) return state.confirmedAt;
  return state.lastChangeAt;
}

function computeStatus() {
  const t = now();
  if (t - state.lastHeartbeatAt >= HEARTBEAT_LIMIT_MIN * MINUTE) return 'off';
  if (t - baseTime() >= THRESHOLD_HOURS * HOUR) return 'check';
  return 'ok';
}

// 状態が変わったときにだけ行う処理（記録と通知）
function handleStatus(status) {
  // 切られた：信号が途絶えた時刻で1回だけ記録
  if (status === 'off' && !lostRecorded) {
    addRecord(state.lastHeartbeatAt, 'lost');
    lostRecorded = true;
  }
  if (status !== 'off') lostRecorded = false;

  // 16時間たった：同じ時刻について1回だけ通知
  const base = baseTime().getTime();
  if (status === 'check' && notifiedFor !== base) {
    notifiedFor = base;
    sendNotification();
  }
}

// 家族への通知（デモではコンソールに出すだけ）
function sendNotification() {
  if (state.away) {
    console.log('[イキテル] 留守中のため、通知を送りませんでした');
    return;
  }
  console.log(`[イキテル] 通知：${THRESHOLD_HOURS}時間、トイレの電気のオン・オフがありません`);
}


// ---------------------------------------------------------------------
// 6. 画面の書き換え
// ---------------------------------------------------------------------
const $ = (selector) => document.querySelector(selector);

function render() {
  simulateHeartbeat();
  const status = computeStatus();
  handleStatus(status);

  // ② 状態（属性と文字だけ変える）
  document.body.dataset.status = status;
  const card = $('#status-card');
  card.dataset.status = status;
  card.classList.toggle('is-away', state.away);
  $('#status-label').textContent = STATUS_TEXT[status].label;
  $('#status-sub').textContent = STATUS_TEXT[status].sub;
  $('#away-badge').hidden = !state.away;
  $('.btn-away-label').textContent = state.away ? '留守を解除' : '留守にする';

  // ③ 最後に電気が動いた時刻
  const t = now();
  $('#last-change').textContent =
    `${formatDayTime(state.lastChangeAt)}（${formatDuration(t - state.lastChangeAt)}前）`;

  // ④ 通知までの残り時間とバー
  const limit = THRESHOLD_HOURS * HOUR;
  const elapsed = t - baseTime();
  let remainText;
  let barPercent = Math.min(100, (elapsed / limit) * 100);

  if (status === 'off') {
    remainText = '中継器と通信できないため判定できません';
    barPercent = 0;
  } else if (state.away) {
    remainText = '留守中のため通知を止めています';
  } else if (status === 'check') {
    remainText = `通知済み（${formatDayTime(new Date(baseTime().getTime() + limit))}）`;
  } else {
    remainText = 'あと ' + formatDuration(limit - elapsed);
  }
  $('#remain-text').textContent = remainText;
  $('#remain-bar-fill').style.width = barPercent + '%';

  // ⑤ 直近の記録（新しい順）
  renderRecords();

  // デモ操作の表示
  $('#demo-clock').textContent = formatDayTime(t);
  $('#demo-light').textContent = demo.lightIsOn ? '電気を消す' : '電気をつける';
  $('#demo-off').textContent = demo.relayPlugged ? '中継器を抜く' : '中継器を差す';
}

function renderRecords() {
  const list = $('#record-list');
  list.innerHTML = ''; // 見本の行も消して作り直す

  state.records.slice(0, RECORD_SHOW_COUNT).forEach((record) => {
    const li = document.createElement('li');
    li.className = 'record';
    li.dataset.event = record.event;

    const dot = document.createElement('span');
    dot.className = 'record-dot';

    const time = document.createElement('span');
    time.className = 'record-time';
    time.textContent = formatDayTime(record.at);

    const text = document.createElement('span');
    text.className = 'record-event';
    text.textContent = EVENT_TEXT[record.event];

    li.append(dot, time, text);
    list.appendChild(li);
  });
}


// ---------------------------------------------------------------------
// 7. ボタンの動き
// ---------------------------------------------------------------------

// 電話する：<a href="tel:"> なので、スマホでは電話アプリが開く（JSは不要）

// 無事を確認：16時間を数え直し、記録に残す
$('#btn-confirm').addEventListener('click', () => {
  state.confirmedAt = now();
  addRecord(state.confirmedAt, 'confirm');
  render();
});

// 留守にする／留守を解除
$('#btn-away').addEventListener('click', () => {
  state.away = !state.away;
  render();
});


// ---------------------------------------------------------------------
// 8. デモ操作（中継器の代わり）
// ---------------------------------------------------------------------

// 電気をつける／消す：中継器が差さっているときだけ入力が届く
$('#demo-light').addEventListener('click', () => {
  demo.lightIsOn = !demo.lightIsOn;
  if (demo.relayPlugged) {
    receiveLightEvent(demo.lightIsOn ? 'on' : 'off');
  } else {
    console.log('[デモ] 中継器が抜けているので、照明の入力は届きません');
    render();
  }
});

// 中継器を抜く／差す
$('#demo-off').addEventListener('click', () => {
  if (demo.relayPlugged) {
    // 切られた入力：信号が止まる。30分待つ代わりに時計を30分進める
    demo.relayPlugged = false;
    demoOffsetMs += HEARTBEAT_LIMIT_MIN * MINUTE;
  } else {
    // 入れられた入力：差し直すとすぐ信号が届く
    demo.relayPlugged = true;
    receiveHeartbeat();
  }
  render();
});

// 時計を進める
$('#demo-1h').addEventListener('click', () => advanceClock(1 * HOUR));
$('#demo-16h').addEventListener('click', () => advanceClock(THRESHOLD_HOURS * HOUR));

function advanceClock(ms) {
  demoOffsetMs += ms;
  // 差さっていれば、その間も信号は届き続けていたことにする
  if (demo.relayPlugged) receiveHeartbeat();
  render();
}


// ---------------------------------------------------------------------
// 9. 小さな道具
// ---------------------------------------------------------------------
function addRecord(at, event) {
  state.records.push({ at, event });
  state.records.sort((a, b) => b.at - a.at); // 新しい順
}

function formatClock(date) {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDayTime(date) {
  const day = new Date(date); day.setHours(0, 0, 0, 0);
  const today = now(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - day) / (24 * HOUR));
  const prefix =
    diffDays === 0 ? '今日' :
    diffDays === 1 ? '昨日' :
    `${date.getMonth() + 1}/${date.getDate()}`;
  return `${prefix} ${formatClock(date)}`;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / MINUTE));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `${m}分` : `${h}時間${String(m).padStart(2, '0')}分`;
}


// ---------------------------------------------------------------------
// 10. 起動
// ---------------------------------------------------------------------
render();
setInterval(render, MINUTE); // 画面は1分ごとに描き直す
