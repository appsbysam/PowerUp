(() => {
  const ACTIVE_BUSINESS_KEY = 'schedule_plus_active_business';
  const BRAND_CACHE_KEY = 'schedule_plus_brand_cache';
  const DEFAULT_LOGO = 'assets/icons/icon.svg';
  const state = { business:null, membership:null, memberships:[] };

  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const validHex = (v, fallback) => /^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : fallback;

  function cacheBrand(business){
    try { localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify({business_name:business?.business_name,logo_url:business?.logo_url,accent_color:business?.accent_color,secondary_color:business?.secondary_color})); } catch(_) {}
  }

  function cachedBrand(){
    try { return JSON.parse(localStorage.getItem(BRAND_CACHE_KEY) || 'null'); } catch(_) { return null; }
  }

  function ensureUi(){
    if(document.getElementById('businessSettingsBtn')) return;

    const profileActions = document.querySelector('.menu-profile-actions');
    if(profileActions){
      const btn = document.createElement('button');
      btn.id = 'businessSettingsBtn';
      btn.className = 'tenant-settings-btn';
      btn.type = 'button';
      btn.textContent = 'Business settings';
      profileActions.appendChild(btn);
    }

    const app = document.getElementById('appView') || document.body;
    const settings = document.createElement('dialog');
    settings.id = 'businessSettingsDialog';
    settings.className = 'tenant-dialog';
    settings.innerHTML = `
      <div class="tenant-card">
        <div class="dialog-head"><div><h2>Business settings</h2><span id="businessRole" class="tenant-role"></span></div><button id="businessSettingsClose" class="ghost" type="button">✕</button></div>
        <form id="businessSettingsForm" class="tenant-form">
          <div class="tenant-logo-row"><img id="businessLogoPreview" class="tenant-logo-preview" src="${DEFAULT_LOGO}" alt="Business logo preview"><div><label>Business logo<input id="businessLogoFile" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label><div class="tenant-logo-help">PNG, JPG, WebP or SVG, up to 2 MB.</div></div></div>
          <label>Business name<input id="businessNameInput" maxlength="100" required></label>
          <div class="tenant-grid2"><label>Phone<input id="businessPhoneInput" type="tel"></label><label>Email<input id="businessEmailInput" type="email"></label></div>
          <label>Business address<textarea id="businessAddressInput" rows="2"></textarea></label>
          <div class="tenant-grid2"><label>Primary colour<div class="tenant-colour"><input id="businessAccentInput" type="color" value="#ff00a8"><input id="businessAccentText" maxlength="7" value="#ff00a8"></div></label><label>Secondary colour<div class="tenant-colour"><input id="businessSecondaryInput" type="color" value="#0d9488"><input id="businessSecondaryText" maxlength="7" value="#0d9488"></div></label></div>
          <div id="businessReadonly" class="tenant-readonly hidden">Only a business owner or admin can change these settings.</div>
          <p id="businessSettingsMessage" class="tenant-message"></p>
          <div class="dialog-actions"><button id="businessSettingsCancel" class="secondary" type="button">Cancel</button><button id="businessSettingsSave" class="primary" type="submit">Save business</button></div>
        </form>
      </div>`;
    app.appendChild(settings);

    const onboarding = document.createElement('dialog');
    onboarding.id = 'businessOnboardingDialog';
    onboarding.className = 'tenant-dialog tenant-onboarding';
    onboarding.innerHTML = `
      <div class="tenant-card">
        <div><p class="eyebrow">SCHEDULE+ SETUP</p><h2>Create your business</h2></div>
        <p class="tenant-onboarding-copy">This creates your private business workspace. Your jobs, users and branding will be kept separate from every other Schedule+ business.</p>
        <form id="businessOnboardingForm" class="tenant-form">
          <label>Business name<input id="onboardingBusinessName" maxlength="100" placeholder="e.g. Smith Electrical" required></label>
          <p id="businessOnboardingMessage" class="tenant-message"></p>
          <button class="primary" type="submit">Create business</button>
        </form>
      </div>`;
    app.appendChild(onboarding);

    document.getElementById('businessSettingsBtn')?.addEventListener('click', openSettings);
    document.getElementById('businessSettingsClose')?.addEventListener('click', () => settings.close());
    document.getElementById('businessSettingsCancel')?.addEventListener('click', () => settings.close());
    document.getElementById('businessSettingsForm')?.addEventListener('submit', saveSettings);
    document.getElementById('businessOnboardingForm')?.addEventListener('submit', createBusiness);
    document.getElementById('businessLogoFile')?.addEventListener('change', previewLogo);

    bindColourPair('businessAccentInput','businessAccentText','#ff00a8');
    bindColourPair('businessSecondaryInput','businessSecondaryText','#0d9488');
  }

  function bindColourPair(pickerId, textId, fallback){
    const picker = document.getElementById(pickerId), text = document.getElementById(textId);
    if(!picker || !text) return;
    picker.addEventListener('input',()=> text.value = picker.value);
    text.addEventListener('input',()=>{
      const v = validHex(text.value, null);
      if(v) picker.value = v;
    });
    text.addEventListener('blur',()=>{
      const v = validHex(text.value, fallback);
      text.value = v; picker.value = v;
    });
  }

  function previewLogo(e){
    const file = e.target.files?.[0];
    if(!file) return;
    if(file.size > 2 * 1024 * 1024){ alert('Logo must be 2 MB or smaller.'); e.target.value=''; return; }
    const preview = document.getElementById('businessLogoPreview');
    if(preview) preview.src = URL.createObjectURL(file);
  }

  function applyBranding(business){
    if(!business) return;
    const accent = validHex(business.accent_color, '#ff00a8');
    const secondary = validHex(business.secondary_color, '#0d9488');
    document.documentElement.style.setProperty('--tenant-accent', accent);
    document.documentElement.style.setProperty('--tenant-secondary', secondary);

    const logo = business.logo_url || DEFAULT_LOGO;
    document.querySelectorAll('.topbar .brand img,.side-menu-head img').forEach(img => { img.src = logo; img.alt = `${business.business_name || 'Business'} logo`; });

    const sideHead = document.querySelector('.side-menu-head > div');
    if(sideHead){
      let el = document.getElementById('tenantBusinessName');
      if(!el){ el = document.createElement('span'); el.id='tenantBusinessName'; el.className='tenant-business-name'; sideHead.appendChild(el); }
      el.textContent = business.business_name || 'Business';
    }

    const eyebrow = document.querySelector('#dashboardView .hero-row .eyebrow');
    if(eyebrow) eyebrow.textContent = business.business_name ? `JOB ORGANISER · ${business.business_name.toUpperCase()}` : 'JOB ORGANISER';

    document.title = `${business.app_name || 'Schedule+'} · ${business.business_name || 'Business'}`;
    cacheBrand(business);
  }

  function applyCachedBrand(){
    const cached = cachedBrand();
    if(cached) applyBranding({...cached,app_name:'Schedule+'});
  }

  async function loadContext(){
    const {data:{session}} = await supabaseClient.auth.getSession();
    const user = session?.user;
    if(!user) return false;

    const {data:memberships,error:mError} = await supabaseClient
      .from('business_users')
      .select('business_id,role,is_active')
      .eq('user_id', user.id)
      .eq('is_active', true);
    if(mError){ console.warn('Business membership load failed',mError); return false; }

    state.memberships = memberships || [];
    if(!state.memberships.length){
      state.business = null; state.membership = null;
      showOnboarding();
      return false;
    }

    let chosenId = localStorage.getItem(ACTIVE_BUSINESS_KEY);
    if(!state.memberships.some(m => m.business_id === chosenId)) chosenId = state.memberships[0].business_id;
    localStorage.setItem(ACTIVE_BUSINESS_KEY, chosenId);
    state.membership = state.memberships.find(m => m.business_id === chosenId) || state.memberships[0];

    const {data:business,error:bError} = await supabaseClient.from('businesses').select('*').eq('id', state.membership.business_id).single();
    if(bError){ console.warn('Business load failed',bError); return false; }
    state.business = business;
    applyBranding(business);
    window.SchedulePlusBusiness = { get business(){return state.business;}, get membership(){return state.membership;}, reload:loadContext };
    return true;
  }

  function showOnboarding(){
    ensureUi();
    const dialog = document.getElementById('businessOnboardingDialog');
    if(dialog && !dialog.open) dialog.showModal();
  }

  async function createBusiness(e){
    e.preventDefault();
    const input = document.getElementById('onboardingBusinessName');
    const message = document.getElementById('businessOnboardingMessage');
    const name = String(input?.value || '').trim();
    if(name.length < 2){ if(message) message.textContent='Enter a business name.'; return; }
    const button = e.submitter;
    if(button){ button.disabled=true; button.textContent='Creating…'; }
    const {error} = await supabaseClient.rpc('create_business_for_current_user',{p_business_name:name,p_slug:null});
    if(button){ button.disabled=false; button.textContent='Create business'; }
    if(error){ if(message) message.textContent=error.message; return; }
    document.getElementById('businessOnboardingDialog')?.close();
    await loadContext();
    if(typeof loadJobs === 'function') await loadJobs();
  }

  function openSettings(){
    ensureUi();
    const b = state.business;
    if(!b) return showOnboarding();
    const canEdit = ['owner','admin'].includes(state.membership?.role);
    document.getElementById('businessRole').textContent = state.membership?.role || 'member';
    document.getElementById('businessNameInput').value = b.business_name || '';
    document.getElementById('businessPhoneInput').value = b.phone || '';
    document.getElementById('businessEmailInput').value = b.email || '';
    document.getElementById('businessAddressInput').value = b.address || '';
    const accent = validHex(b.accent_color,'#ff00a8'), secondary = validHex(b.secondary_color,'#0d9488');
    document.getElementById('businessAccentInput').value = accent;
    document.getElementById('businessAccentText').value = accent;
    document.getElementById('businessSecondaryInput').value = secondary;
    document.getElementById('businessSecondaryText').value = secondary;
    document.getElementById('businessLogoPreview').src = b.logo_url || DEFAULT_LOGO;
    document.getElementById('businessLogoFile').value = '';
    document.getElementById('businessSettingsMessage').textContent = '';
    document.getElementById('businessReadonly').classList.toggle('hidden', canEdit);
    document.querySelectorAll('#businessSettingsForm input,#businessSettingsForm textarea').forEach(el => el.disabled = !canEdit);
    document.getElementById('businessSettingsCancel').disabled = false;
    document.getElementById('businessSettingsSave').classList.toggle('hidden', !canEdit);
    document.getElementById('businessSettingsDialog').showModal();
    document.getElementById('sideMenu')?.classList.remove('open');
    document.getElementById('drawerBackdrop')?.classList.add('hidden');
  }

  async function uploadLogo(file){
    if(!file) return state.business?.logo_url || null;
    if(file.size > 2 * 1024 * 1024) throw new Error('Logo must be 2 MB or smaller.');
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g,'') || 'png';
    const path = `${state.business.id}/logo-${Date.now()}.${ext}`;
    const {error} = await supabaseClient.storage.from('business-logos').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type || undefined});
    if(error) throw error;
    return supabaseClient.storage.from('business-logos').getPublicUrl(path).data.publicUrl;
  }

  async function saveSettings(e){
    e.preventDefault();
    if(!state.business || !['owner','admin'].includes(state.membership?.role)) return;
    const message = document.getElementById('businessSettingsMessage');
    const save = document.getElementById('businessSettingsSave');
    const name = String(document.getElementById('businessNameInput').value || '').trim();
    if(name.length < 2){ message.textContent='Business name must be at least 2 characters.'; return; }
    save.disabled=true; save.textContent='Saving…'; message.textContent=''; message.classList.remove('ok');
    try{
      const file = document.getElementById('businessLogoFile').files?.[0];
      const logoUrl = await uploadLogo(file);
      const payload = {
        business_name:name,
        phone:String(document.getElementById('businessPhoneInput').value || '').trim() || null,
        email:String(document.getElementById('businessEmailInput').value || '').trim() || null,
        address:String(document.getElementById('businessAddressInput').value || '').trim() || null,
        accent_color:validHex(document.getElementById('businessAccentText').value,'#ff00a8'),
        secondary_color:validHex(document.getElementById('businessSecondaryText').value,'#0d9488'),
        logo_url:logoUrl
      };
      const {data,error} = await supabaseClient.from('businesses').update(payload).eq('id',state.business.id).select('*').single();
      if(error) throw error;
      state.business = data;
      applyBranding(data);
      message.textContent='Business settings saved.'; message.classList.add('ok');
      setTimeout(()=>document.getElementById('businessSettingsDialog')?.close(),450);
    }catch(err){ message.textContent = err?.message || 'Could not save business settings.'; }
    finally{ save.disabled=false; save.textContent='Save business'; }
  }

  async function boot(){
    ensureUi();
    applyCachedBrand();
    await loadContext();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();

  supabaseClient.auth.onAuthStateChange((event,session)=>{
    if(event === 'SIGNED_OUT'){
      state.business=null; state.membership=null; state.memberships=[];
      return;
    }
    if(session?.user) setTimeout(loadContext,0);
  });
})();
