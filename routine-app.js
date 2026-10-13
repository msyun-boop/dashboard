let currentUser = null, db = null, auth = null;
(function () {
  const login = document.getElementById('routine-login');
  const shell = document.getElementById('routine-shell');
  const signIn = document.getElementById('routine-google-login');
  const status = document.getElementById('routine-auth-status');
  const shellStatus = document.getElementById('routine-shell-status');
  const retry = document.getElementById('routine-auth-retry');
  const signOut = document.getElementById('routine-signout');
  const install = document.getElementById('routine-install-dialog');
  function fail(message) {status.textContent = message; retry.hidden = false;}
  function loginError(error) {
    const code = error && error.code;
    if (code === 'auth/popup-blocked') return '로그인 창이 차단됐어요. Safari의 팝업 차단 설정을 확인한 뒤 다시 로그인해 주세요.';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '로그인 창이 닫혔어요. Google로 로그인을 다시 눌러 주세요.';
    if (code === 'auth/unauthorized-domain') return '이 사이트의 로그인 연결 설정을 확인해야 해요. 기존 대시보드에서 로그인할 수 있는지 확인해 주세요.';
    if (code === 'auth/web-storage-unsupported') return '로그인에 필요한 브라우저 저장 공간을 사용할 수 없어요. Safari 일반 탭에서 다시 열어 주세요.';
    if (code === 'auth/network-request-failed') return '인터넷 연결을 확인하고 다시 로그인해 주세요.';
    return '로그인하지 못했어요. Safari에서 다시 열어 로그인해 주세요.';
  }
  retry.addEventListener('click', () => window.location.reload());
  document.getElementById('routine-install').addEventListener('click', () => install.showModal());
  document.getElementById('routine-install-close').addEventListener('click', () => install.close());
  signIn.addEventListener('click', () => {
    if (!auth || signIn.disabled) return;
    status.textContent = 'Google 로그인 창을 열고 있어요…';
    retry.hidden = true;
    const provider = new firebase.auth.GoogleAuthProvider();
    if (provider.setCustomParameters) provider.setCustomParameters({prompt: 'select_account'});
    signIn.disabled = true;
    // Keep popup creation within the user's tap; redirect requires same-site auth hosting.
    auth.signInWithPopup(provider).catch(error => {
      status.textContent = loginError(error);
    }).finally(() => {signIn.disabled = false;});
  });
  signOut.addEventListener('click', async () => {
    if (!auth) return;
    signOut.disabled = true;
    shellStatus.textContent = '';
    try {await auth.signOut();}
    catch (_) {shellStatus.textContent = '로그아웃하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.';}
    finally {signOut.disabled = false;}
  });
  try {
    if (!window.firebase || !firebase.auth || !firebase.firestore) throw new Error('SDK unavailable');
    firebase.initializeApp({
  apiKey: "AIzaSyC_zuSnAsBUinM9prCVELqEqGBtPvXG1D8",
  authDomain: "minsu-dash.firebaseapp.com",
  projectId: "minsu-dash",
  storageBucket: "minsu-dash.firebasestorage.app",
  messagingSenderId: "268954484536",
  appId: "1:268954484536:web:ff5c3d415af26bf34a0bcd"
});
    db = firebase.firestore();
    auth = firebase.auth();
    auth.onAuthStateChanged(user => {
      currentUser = user || null;
      shell.hidden = !user;
      login.hidden = !!user;
      shellStatus.textContent = '';
      if (user) {
        document.getElementById('routine-account').textContent = user.email || user.displayName || '로그인됨';
        setupRoutines(user);
      } else {
        stopRoutines();
        document.getElementById('routine-account').textContent = '';
        status.textContent = '기존 대시보드와 같은 계정을 선택해 주세요.';
      }
    }, () => fail('로그인 연결을 확인하지 못했어요. 인터넷 연결을 확인하고 다시 연결해 주세요.'));
    signIn.disabled = false;
  } catch (_) {
    fail('연결을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 연결해 주세요.');
  }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();