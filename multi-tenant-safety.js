(() => {
  const ACTIVE_BUSINESS_KEY = 'schedule_plus_active_business';

  async function getActiveBusinessId() {
    const direct = window.SchedulePlusBusiness?.business?.id;
    if (direct) return direct;
    if (typeof currentUser === 'undefined' || !currentUser?.id) return null;

    const {data, error} = await supabaseClient
      .from('business_users')
      .select('business_id,is_active')
      .eq('user_id', currentUser.id)
      .eq('is_active', true);
    if (error) throw error;
    const memberships = data || [];
    if (!memberships.length) return null;

    let id = localStorage.getItem(ACTIVE_BUSINESS_KEY);
    if (!memberships.some(m => m.business_id === id)) id = memberships[0].business_id;
    localStorage.setItem(ACTIVE_BUSINESS_KEY, id);
    return id;
  }

  async function safeLoadJobs() {
    const businessId = await getActiveBusinessId();
    if (!businessId) {
      jobs = [];
      if (typeof render === 'function') render();
      if (typeof renderCalendar === 'function') renderCalendar();
      return;
    }
    const {data,error} = await supabaseClient
      .from('jobs')
      .select('*')
      .eq('business_id', businessId)
      .order('scheduled_date',{ascending:true,nullsFirst:false})
      .order('created_at',{ascending:false});
    if (error) {
      if (typeof jobsList !== 'undefined' && jobsList) jobsList.innerHTML = `<div class="empty">${typeof esc === 'function' ? esc(error.message) : error.message}</div>`;
      return;
    }
    jobs = data || [];
    if (typeof render === 'function') render();
    if (typeof renderCalendar === 'function') renderCalendar();
  }

  async function safeDeleteJob(id, ask = true) {
    const businessId = await getActiveBusinessId();
    if (!businessId) return;
    const job = (typeof jobs !== 'undefined' ? jobs : []).find(j => j.id === id);
    if (ask && (!job || !confirm(`Delete ${job.customer_name || 'this job'}?`))) return;
    const {error} = await supabaseClient.from('jobs').delete().eq('id', id).eq('business_id', businessId);
    if (error) { alert(error.message); return; }
    if (typeof dialog !== 'undefined' && dialog?.open) dialog.close();
    await safeLoadJobs();
  }

  function field(id) { return document.getElementById(id); }
  function numberOrNull(v) {
    const s = String(v ?? '').trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function addressParts(value) {
    return typeof extractAddressParts === 'function' ? extractAddressParts(value) : {suburb:null,postcode:null};
  }

  async function saveJob(e) {
    if (e.defaultPrevented) return;
    e.preventDefault();
    e.stopImmediatePropagation();

    try {
      const businessId = await getActiveBusinessId();
      if (!businessId) { alert('Create or join a business before saving jobs.'); return; }
      if (typeof currentUser === 'undefined' || !currentUser?.id) { alert('Please sign in again.'); return; }

      const id = field('jobId')?.value || '';
      const existing = id && typeof jobs !== 'undefined' ? jobs.find(j => j.id === id) : null;
      const hours = Number(field('estimatedHours')?.value) || 0;
      const addressInput = field('addressLine');
      const address = addressInput?.value.trim() || '';
      const parsed = addressParts(address);
      const selectedLat = numberOrNull(addressInput?.dataset.mapsLatitude);
      const selectedLng = numberOrNull(addressInput?.dataset.mapsLongitude);
      const addressUnchanged = !!existing && (existing.address_line || '') === address;
      const latitude = selectedLat ?? (addressUnchanged ? existing?.latitude ?? null : null);
      const longitude = selectedLng ?? (addressUnchanged ? existing?.longitude ?? null : null);
      const suburb = addressInput?.dataset.mapsSuburb || parsed.suburb;
      const postcode = addressInput?.dataset.mapsPostcode || parsed.postcode;

      const payload = {
        title: field('jobTitle')?.value,
        customer_name: field('customerName')?.value.trim() || null,
        customer_phone: field('customerPhone')?.value.trim() || null,
        address_line: address || null,
        suburb: suburb || null,
        postcode: postcode || null,
        latitude,
        longitude,
        description: field('description')?.value.trim() || null,
        notes: null,
        panel_brand: field('panelBrand')?.value.trim() || null,
        panel_type: field('panelType')?.value.trim() || null,
        panel_quantity: numberOrNull(field('panelQuantity')?.value),
        solar_capacity_kw: numberOrNull(field('solarCapacity')?.value),
        battery_brand: field('batteryBrand')?.value.trim() || null,
        battery_type: field('batteryType')?.value.trim() || null,
        battery_capacity_kwh: numberOrNull(field('batteryCapacity')?.value),
        phase_type: field('phaseType')?.value || null,
        inverter_brand: field('inverterBrand')?.value.trim() || null,
        inverter_type: field('inverterType')?.value.trim() || null,
        inverter_capacity_kw: numberOrNull(field('inverterCapacity')?.value),
        work_involved: field('workInvolved')?.value.trim() || null,
        status: field('status')?.value,
        priority: field('priority')?.value,
        scheduled_date: field('scheduledDate')?.value || null,
        scheduled_start: field('scheduledStart')?.value || null,
        estimated_minutes: hours ? Math.round(hours * 60) : null,
        completed_at: field('status')?.value === 'completed' ? (existing?.completed_at || new Date().toISOString()) : null
      };

      let query;
      if (id) {
        query = supabaseClient.from('jobs').update(payload).eq('id', id).eq('business_id', businessId);
      } else {
        query = supabaseClient.from('jobs').insert({...payload, business_id:businessId, user_id:currentUser.id});
      }
      const {error} = await query;
      if (error) { alert(error.message); return; }
      if (typeof dialog !== 'undefined' && dialog) dialog.close();
      await safeLoadJobs();
    } catch (err) {
      console.error('Schedule+ job save failed', err);
      alert(err?.message || 'Could not save job.');
    }
  }

  function install() {
    if (window.__schedulePlusTenantSafetyInstalled) return;
    window.__schedulePlusTenantSafetyInstalled = true;

    if (typeof loadJobs === 'function') loadJobs = safeLoadJobs;
    if (typeof deleteJobFromDashboard === 'function') {
      deleteJobFromDashboard = async function(id) { await safeDeleteJob(id, true); };
    }

    const form = field('jobForm');
    if (form) form.addEventListener('submit', saveJob, true);

    const deleteBtn = field('deleteJobBtn');
    if (deleteBtn) deleteBtn.onclick = async () => {
      const id = field('jobId')?.value;
      if (!id || !confirm('Delete this job?')) return;
      await safeDeleteJob(id, false);
    };

    if (typeof currentUser !== 'undefined' && currentUser?.id) safeLoadJobs().catch(console.error);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
