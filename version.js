const APP_VERSION='0.4.12';
console.info(`Schedule+ v${APP_VERSION}`);

(() => {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) viewport.setAttribute('content','width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');

  const style = document.createElement('style');
  style.textContent = `
    html,body{overscroll-behavior-y:none}
    .auth-shell{position:fixed!important;inset:0!important;width:100%!important;height:100dvh!important;min-height:0!important;overflow:hidden!important;padding:max(12px,env(safe-area-inset-top)) 20px max(12px,env(safe-area-inset-bottom))!important}
    .auth-card{max-height:calc(100dvh - 24px);overflow:auto;overscroll-behavior:contain}
    body.schedule-plus-no-zoom{touch-action:pan-y}
    .profile-actions #notificationSettingsBtn{width:100%;margin:0}
  `;
  document.head.appendChild(style);
  document.body.classList.add('schedule-plus-no-zoom');

  document.addEventListener('gesturestart', e => e.preventDefault(), {passive:false});

  let hiddenAt = 0;
  const RESUME_LOCK_MS = 5000;

  function hasLocalPin(){
    try {
      return !!(typeof currentUser !== 'undefined' && currentUser?.id && localStorage.getItem(`powerup_pin_${currentUser.id}`));
    } catch(_) { return false; }
  }

  function showPinLock(){
    if (!hasLocalPin()) return;
    try { pinUnlocked = false; } catch(_) {}
    const app = document.getElementById('appView');
    const pin = document.getElementById('pinView');
    const auth = document.getElementById('authView');
    const input = document.getElementById('pinUnlock');
    app?.classList.add('hidden');
    auth?.classList.add('hidden');
    pin?.classList.remove('hidden');
    if (input) input.value = '';
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt >= RESUME_LOCK_MS) showPinLock();
    hiddenAt = 0;
  });

  window.addEventListener('pagehide', () => { hiddenAt = Date.now(); });
  window.addEventListener('pageshow', e => {
    if (e.persisted && hasLocalPin()) showPinLock();
  });

  document.addEventListener('DOMContentLoaded', () => {
    const actions = document.querySelector('#profileModal .profile-actions');
    if (actions && !document.getElementById('notificationSettingsBtn')) {
      const btn = document.createElement('button');
      btn.id = 'notificationSettingsBtn';
      btn.className = 'secondary';
      btn.type = 'button';
      btn.textContent = 'Notifications';
      btn.addEventListener('click', () => alert('Notification settings are ready to be added next.'));
      actions.appendChild(btn);
    }

    const notes = document.querySelector('#updateModal .update-notes');
    if (notes) notes.innerHTML = '<li>Login and PIN screens are now fixed to the phone screen instead of sliding up and down.</li><li>Pinch-to-zoom is disabled throughout Schedule+ while normal vertical scrolling remains available.</li><li>If a PIN is set, reopening the app after it has been in the background will ask for the PIN instead of requiring the full login again.</li><li>Added a Notifications option to User profile, ready for notification functionality to be connected later.</li>';
  });
})();
