(() => {
  const VERSION = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '0.4.05';
  const RELEASE_KEY = 'schedule_plus_last_seen_version';
  const DEVICE_KEY = 'schedule_plus_device_id';

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  function fallbackFriendlyName(email=''){
    const local = String(email || '').split('@')[0] || 'Signed in';
    return local.replace(/[._-]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
  }

  function displayName(user){
    const saved = String(user?.user_metadata?.display_name || '').trim();
    return saved || fallbackFriendlyName(user?.email || '');
  }

  function getDeviceId(){
    let id = localStorage.getItem(DEVICE_KEY);
    if(!id){
      const raw = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^a-z0-9]/gi,'').toUpperCase();
      id = `SCH-${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}`;
      localStorage.setItem(DEVICE_KEY,id);
    }
    return id;
  }

  function getDeviceType(){
    const ua = navigator.userAgent || '';
    if(/iPad|Tablet/i.test(ua)) return 'Tablet';
    if(/Android/i.test(ua) && /Mobile/i.test(ua)) return 'Android phone';
    if(/iPhone/i.test(ua)) return 'iPhone';
    if(/Android/i.test(ua)) return 'Android device';
    if(/Windows/i.test(ua)) return 'Windows computer';
    if(/Macintosh|Mac OS/i.test(ua)) return 'Mac computer';
    return 'Web browser';
  }

  function getBrowserName(){
    const ua = navigator.userAgent || '';
    if(/Edg\//i.test(ua)) return 'Microsoft Edge';
    if(/Chrome\//i.test(ua)) return 'Chrome / Chromium';
    if(/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
    if(/Firefox\//i.test(ua)) return 'Firefox';
    return 'Browser';
  }

  function dashboardStatus(j){
    if(j.status === 'waiting') return 'Follow-Up';
    if(j.status === 'completed') return 'Completed';
    if(j.status === 'in_progress') return 'In progress';
    if(j.scheduled_date) return 'Scheduled';
    return 'Unscheduled';
  }

  function dashboardSuburb(j){
    if(j.suburb) return j.suburb;
    if(typeof suburbFromAddress === 'function') return suburbFromAddress(j.address_line || '') || 'Suburb not set';
    return 'Suburb not set';
  }

  if(typeof jobCardHtml === 'function'){
    jobCardHtml = function(j){
      const phone = j.customer_phone
        ? `<a class="compact-phone" href="tel:${esc(j.customer_phone.replace(/\s+/g,''))}">${esc(j.customer_phone)}</a>`
        : '<span class="compact-phone missing">No phone</span>';
      return `<div class="swipe-row compact-swipe-row" data-id="${j.id}">
        <button class="swipe-delete swipe-delete-left" type="button" aria-label="Delete ${esc(j.customer_name || 'job')}">Delete</button>
        <article class="job-card compact-job-card" data-id="${j.id}">
          <div class="compact-card-top"><strong>${esc(j.customer_name || 'No customer')}</strong><span class="chip compact-status">${esc(dashboardStatus(j))}</span></div>
          <div class="compact-card-middle"><span class="compact-suburb">${esc(dashboardSuburb(j))}</span>${phone}</div>
          <div class="compact-card-bottom"><span class="job-type-chip">${esc(j.title || 'Job')}</span></div>
        </article>
        <button class="swipe-delete swipe-delete-right" type="button" aria-label="Delete ${esc(j.customer_name || 'job')}">Delete</button>
      </div>`;
    };
    if(typeof render === 'function') render();
  }

  function removeDuplicateTechSections(){
    const seen = new Set();
    document.querySelectorAll('#jobForm details.tech-section, #jobForm details.job-accordion').forEach(section => {
      const heading = section.querySelector('summary')?.textContent?.trim().toLowerCase() || '';
      const key = heading.startsWith('system details') ? 'system details' : heading.startsWith('battery') ? 'battery' : heading.startsWith('inverter') ? 'inverter' : heading;
      if(!key) return;
      if(seen.has(key)) section.remove();
      else seen.add(key);
    });
  }
  removeDuplicateTechSections();

  function closeOtherDetails(opened){
    document.querySelectorAll('#jobForm details.tech-section[open]').forEach(d => {
      if(d !== opened) d.removeAttribute('open');
    });
  }
  document.querySelectorAll('#jobForm details.tech-section').forEach(d => {
    d.addEventListener('toggle',()=>{ if(d.open) closeOtherDetails(d); });
  });

  function closeSideMenu(){
    document.getElementById('sideMenu')?.classList.remove('open');
    document.getElementById('drawerBackdrop')?.classList.add('hidden');
  }

  function updateSignedInUser(user){
    const btn = document.getElementById('signedInUser');
    if(btn) btn.textContent = displayName(user);
  }

  function profileRow(label,value,copy=false){
    const safe = esc(value || '—');
    return `<div class="profile-row"><div class="profile-row-label">${esc(label)}</div><div class="profile-row-value"><span>${safe}</span>${copy&&value?`<button class="profile-copy" type="button" data-copy-value="${esc(value)}">Copy</button>`:''}</div></div>`;
  }

  async function openUserProfile(){
    closeSideMenu();
    const modal = document.getElementById('profileModal');
    const body = document.getElementById('profileBody');
    if(!modal || !body) return;
    let user = null;
    try { user = (await supabaseClient.auth.getUser()).data?.user || currentUser || null; } catch(_) { user = currentUser || null; }
    body.innerHTML = `
      <div class="profile-row profile-edit-row">
        <div class="profile-row-label">Username</div>
        <div class="profile-username-edit"><input id="profileUsernameInput" maxlength="40" value="${esc(displayName(user))}" autocomplete="off"><button id="saveUsernameBtn" type="button">Save</button></div>
        <div id="profileUsernameMessage" class="profile-username-message"></div>
      </div>
      ${profileRow('Email',user?.email || '')}
      ${profileRow('User ID',user?.id || '',true)}
      ${profileRow('Device ID',getDeviceId(),true)}
      ${profileRow('Device Type',getDeviceType())}
      ${profileRow('Browser',getBrowserName())}
      ${profileRow('App Version',`v${VERSION}`)}
    `;

    body.querySelectorAll('[data-copy-value]').forEach(btn=>btn.onclick=async()=>{
      try{
        await navigator.clipboard.writeText(btn.dataset.copyValue);
        const old=btn.textContent; btn.textContent='Copied'; setTimeout(()=>btn.textContent=old,900);
      }catch(_){}
    });

    document.getElementById('saveUsernameBtn')?.addEventListener('click', async()=>{
      const input = document.getElementById('profileUsernameInput');
      const message = document.getElementById('profileUsernameMessage');
      const name = String(input?.value || '').trim();
      if(name.length < 2){
        if(message) message.textContent = 'Enter at least 2 characters.';
        input?.focus();
        return;
      }
      const btn = document.getElementById('saveUsernameBtn');
      if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
      const {data,error} = await supabaseClient.auth.updateUser({data:{display_name:name}});
      if(btn){ btn.disabled = false; btn.textContent = 'Save'; }
      if(error){
        if(message) message.textContent = error.message;
        return;
      }
      if(data?.user) currentUser = data.user;
      updateSignedInUser(data?.user || currentUser);
      if(message){
        message.textContent = 'Username updated.';
        message.classList.add('ok');
      }
    });

    modal.showModal();
  }

  function showWhatsNew(force=false){
    const modal = document.getElementById('updateModal');
    if(!modal || modal.open) return;
    const seen = localStorage.getItem(RELEASE_KEY);
    if(!force && seen === VERSION) return;
    document.getElementById('updateVersion').textContent = `Version ${VERSION}`;
    modal.showModal();
  }

  const originalOpenJob = typeof openJob === 'function' ? openJob : null;
  if(originalOpenJob){
    openJob = function(j=null, defaultDate=null){
      removeDuplicateTechSections();
      originalOpenJob(j, defaultDate);
      const btn = document.getElementById('removeCalendarBtn');
      if(btn) btn.classList.toggle('hidden', !(j && j.scheduled_date));
      window.SchedulePlusAddress?.syncFromSource?.();
    };
  }

  document.getElementById('removeCalendarBtn')?.addEventListener('click',async()=>{
    const id = document.getElementById('jobId')?.value;
    if(!id) return;
    const job = jobs.find(j=>String(j.id)===String(id));
    if(!job?.scheduled_date) return;
    if(!confirm('Remove this job from the calendar? The job itself will be kept.')) return;
    const update = {scheduled_date:null, scheduled_start:null};
    if(job.status === 'scheduled') update.status = 'to_schedule';
    const {error} = await supabaseClient.from('jobs').update(update).eq('id',id);
    if(error){ alert(error.message); return; }
    document.getElementById('jobDialog')?.close();
    await loadJobs();
  });

  document.getElementById('signedInUser')?.addEventListener('click',openUserProfile);
  document.getElementById('userProfileMenuBtn')?.addEventListener('click',openUserProfile);
  document.getElementById('profileClose')?.addEventListener('click',()=>document.getElementById('profileModal')?.close());
  document.getElementById('profileDone')?.addEventListener('click',()=>document.getElementById('profileModal')?.close());
  document.getElementById('pinSettingsBtn')?.addEventListener('click',()=>document.getElementById('profileModal')?.close());
  document.getElementById('whatsNewBtn')?.addEventListener('click',()=>{ closeSideMenu(); showWhatsNew(true); });
  document.getElementById('updateDone')?.addEventListener('click',()=>{
    localStorage.setItem(RELEASE_KEY,VERSION);
    document.getElementById('updateModal')?.close();
  });

  (async()=>{
    try{
      const session = (await supabaseClient.auth.getSession()).data?.session;
      updateSignedInUser(session?.user);
      if(session?.user) setTimeout(()=>showWhatsNew(false),250);
    }catch(_){}
  })();
  supabaseClient.auth.onAuthStateChange((_event,session)=>{
    updateSignedInUser(session?.user);
  });
})();
