(() => {
  const status = document.getElementById('connection-status');
  if (typeof BroadcastChannel !== 'function') {
    status.textContent = 'このブラウザーはタブ間のデモ操作に対応していません。';
    return;
  }

  const channel = new BroadcastChannel('ikiteru-theme1-b-7:demo');
  const clock = document.getElementById('demo-clock');
  const light = document.getElementById('demo-light');
  const relay = document.getElementById('demo-relay');
  const buttons = document.querySelectorAll('[data-command]');
  let responseTimer;

  function enableButtons(enabled) {
    for (const button of buttons) button.disabled = !enabled;
  }

  function showDisconnected() {
    enableButtons(false);
    clock.textContent = '—';
    status.textContent = '見守り画面を別タブで開いてログインしてください。';
  }

  function send(type) {
    enableButtons(false);
    clearTimeout(responseTimer);
    status.textContent = type === 'request-state' ? '見守り画面を確認しています…' : '操作を反映しています…';
    channel.postMessage({ type });
    responseTimer = setTimeout(showDisconnected, 2500);
  }

  channel.addEventListener('message', ({ data }) => {
    if (data?.type === 'state') {
      clearTimeout(responseTimer);
      clock.textContent = data.clock;
      light.textContent = data.lightIsOn ? '電気を消す' : '電気をつける';
      relay.textContent = data.relayPlugged ? '中継器を抜く' : '中継器を差す';
      status.textContent = '見守り画面に接続済み';
      enableButtons(true);
    } else if (data?.type === 'disconnected') {
      clearTimeout(responseTimer);
      showDisconnected();
    }
  });

  for (const button of buttons) {
    button.addEventListener('click', () => send(button.dataset.command));
  }
  window.addEventListener('pageshow', () => send('request-state'));
})();
