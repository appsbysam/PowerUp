(() => {
  const UI_VERSION = '0.4.02';
  const NSW_BOUNDS = { west: 140.999, south: -37.6, east: 153.7, north: -28.1 };
  let sessionToken = null;
  let suggestionTimer = null;
  let placesApi = null;

  const addressInput = document.getElementById('addressLine');
  const lookupButton = document.getElementById('mapsLookupBtn');
  const jobForm = document.getElementById('jobForm');
  const jobDialog = document.getElementById('jobDialog');
  if (!addressInput || !jobForm) return;

  function injectRefinementStyles() {
    if (document.getElementById('schedulePlusRefinementStyles')) return;
    const style = document.createElement('style');
    style.id = 'schedulePlusRefinementStyles';
    style.textContent = `
      .job-card.compact-job-card{padding:12px 14px;gap:7px;min-height:0}
      .compact-job-top{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
      .compact-job-name{font-size:1rem;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
      .compact-job-status{flex:0 0 auto;font-size:.73rem;font-weight:800;padding:5px 8px;border-radius:999px;background:#26262b;color:#f4f4f5}
      .compact-job-middle{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#b8b8c0;font-size:.84rem;min-width:0}
      .compact-job-suburb{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
      .compact-job-phone{color:#f4b1db;text-decoration:none;font-size:.84rem;font-weight:700;flex:0 0 auto}
      .compact-job-phone.missing{color:#71717a;font-weight:500}
      .compact-job-bottom{display:flex;align-items:center;justify-content:flex-start}
      .compact-job-type{display:inline-flex;padding:4px 8px;border-radius:999px;background:#25252a;color:#fff;font-size:.74rem;font-weight:800}
      .customer-phone-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(140px,.8fr);gap:12px}
      .job-accordion{border:1px solid #303036;border-radius:14px;background:#17171a;overflow:hidden}
      .job-accordion summary{list-style:none;cursor:pointer;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-weight:800;user-select:none}
      .job-accordion summary::-webkit-details-marker{display:none}
      .job-accordion summary .accordion-title{display:grid;gap:2px}
      .job-accordion summary .accordion-title small{font-size:.72rem;color:#8f8f98;font-weight:600}
      .job-accordion summary::after{content:'›';font-size:1.35rem;line-height:1;color:#a1a1aa;transform:rotate(90deg);transition:transform .16s ease}
      .job-accordion[open] summary::after{transform:rotate(-90deg)}
      .accordion-body{padding:0 14px 14px;display:grid;gap:12px;border-top:1px solid #2b2b30;padding-top:14px}
      .accordion-single{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
      #jobForm .form-section-title{display:none}
      @media(max-width:520px){.customer-phone-grid{grid-template-columns:1fr}.compact-job-middle{align-items:flex-start}.compact-job-phone{white-space:nowrap}}
    `;
    document.head.appendChild(style);
  }

  function labelFor(id) {
    return document.getElementById(id)?.closest('label') || null;
  }

  function makeGrid(className, labels) {
    const div = document.createElement('div');
    div.className = className;
    labels.filter(Boolean).forEach(label => div.appendChild(label));
    return div;
  }

  function makeAccordion(title, subtitle, children) {
    const details = document.createElement('details');
    details.className = 'job-accordion';
    const summary = document.createElement('summary');
    summary.innerHTML = `<span class="accordion-title"><span>${title}</span>${subtitle ? `<small>${subtitle}</small>` : ''}</span>`;
    const body = document.createElement('div');
    body.className = 'accordion-body';
    children.filter(Boolean).forEach(child => body.appendChild(child));
    details.append(summary, body);
    return details;
  }

  function closeOtherAccordions(opened) {
    jobForm.querySelectorAll('.job-accordion[open]').forEach(section => {
      if (section !== opened) section.removeAttribute('open');
    });
  }

  function restructureJobForm() {
    if (jobForm.dataset.refined === 'true') return;
    jobForm.dataset.refined = 'true';

    const hiddenId = document.getElementById('jobId');
    const customer = labelFor('customerName');
    const phone = labelFor('customerPhone');
    const address = labelFor('addressLine');
    const jobType = labelFor('jobTitle');
    const description = labelFor('description');

    const customerGrid = makeGrid('customer-phone-grid', [customer, phone]);
    hiddenId.insertAdjacentElement('afterend', customerGrid);
    customerGrid.insertAdjacentElement('afterend', address);
    address.insertAdjacentElement('afterend', jobType);
    jobType.insertAdjacentElement('afterend', description);

    const oldCustomerGrid = customerGrid.nextElementSibling?.classList?.contains('grid2') ? customerGrid.nextElementSibling : null;
    if (oldCustomerGrid && !oldCustomerGrid.children.length) oldCustomerGrid.remove();

    const panelBrand = labelFor('panelBrand');
    const panelType = labelFor('panelType');
    const panelQuantity = labelFor('panelQuantity');
    const solarCapacity = labelFor('solarCapacity');
    const phaseType = labelFor('phaseType');
    const batteryBrand = labelFor('batteryBrand');
    const batteryType = labelFor('batteryType');
    const batteryCapacity = labelFor('batteryCapacity');
    const inverterBrand = labelFor('inverterBrand');
    const inverterCapacity = labelFor('inverterCapacity');
    const inverterType = labelFor('inverterType');
    const workInvolved = labelFor('workInvolved');

    const systemAccordion = makeAccordion('System details', 'Optional — add what you know', [
      makeGrid('grid2', [panelBrand, panelType]),
      makeGrid('grid3', [panelQuantity, solarCapacity, phaseType])
    ]);
    const batteryAccordion = makeAccordion('Battery', 'Optional', [
      makeGrid('grid2', [batteryBrand, batteryType]),
      makeGrid('accordion-single', [batteryCapacity])
    ]);
    const inverterAccordion = makeAccordion('Inverter', 'Optional', [
      makeGrid('grid2', [inverterBrand, inverterCapacity]),
      makeGrid('accordion-single', [inverterType])
    ]);

    description.insertAdjacentElement('afterend', systemAccordion);
    systemAccordion.insertAdjacentElement('afterend', batteryAccordion);
    batteryAccordion.insertAdjacentElement('afterend', inverterAccordion);
    inverterAccordion.insertAdjacentElement('afterend', workInvolved);

    jobForm.querySelectorAll('.job-accordion').forEach(section => {
      section.addEventListener('toggle', () => {
        if (section.open) closeOtherAccordions(section);
      });
    });

    Array.from(jobForm.children).forEach(child => {
      if ((child.classList?.contains('grid2') || child.classList?.contains('grid3')) && !child.children.length) child.remove();
    });
  }

  function compactStatus(job) {
    if (job.status === 'waiting') return 'Follow-Up';
    if (job.status === 'completed') return 'Completed';
    if (job.status === 'in_progress') return 'In progress';
    if (job.scheduled_date) return 'Scheduled';
    return 'Unscheduled';
  }

  function compactSuburb(job) {
    if (job.suburb) return job.suburb;
    if (typeof suburbFromAddress === 'function') return suburbFromAddress(job.address_line || '') || 'Suburb not set';
    return 'Suburb not set';
  }

  function installCompactDashboardCards() {
    if (typeof window.jobCardHtml !== 'function') return;
    window.jobCardHtml = function(job) {
      const phone = job.customer_phone
        ? `<a class="compact-job-phone" href="tel:${esc(job.customer_phone.replace(/\s+/g,''))}">${esc(job.customer_phone)}</a>`
        : '<span class="compact-job-phone missing">No phone</span>';
      return `<div class="swipe-row" data-id="${job.id}">
        <button class="swipe-delete swipe-delete-left" type="button" aria-label="Delete ${esc(job.customer_name || 'job')}">Delete</button>
        <article class="job-card compact-job-card" data-id="${job.id}">
          <div class="compact-job-top"><strong class="compact-job-name">${esc(job.customer_name || 'No customer')}</strong><span class="compact-job-status">${esc(compactStatus(job))}</span></div>
          <div class="compact-job-middle"><span class="compact-job-suburb">${esc(compactSuburb(job))}</span>${phone}</div>
          <div class="compact-job-bottom"><span class="compact-job-type">${esc(job.title || 'Job type not set')}</span></div>
        </article>
        <button class="swipe-delete swipe-delete-right" type="button" aria-label="Delete ${esc(job.customer_name || 'job')}">Delete</button>
      </div>`;
    };
    try { if (typeof render === 'function') render(); } catch (_) {}
  }

  injectRefinementStyles();
  restructureJobForm();
  installCompactDashboardCards();

  if (jobDialog) {
    jobDialog.addEventListener('close', () => {
      jobForm.querySelectorAll('.job-accordion').forEach(section => section.removeAttribute('open'));
    });
  }

  if (lookupButton) lookupButton.hidden = true;

  const wrap = addressInput.closest('.address-row') || addressInput.parentElement;
  if (wrap) wrap.classList.add('places-address-wrap');

  if (!document.querySelector('.places-hint')) {
    const hint = document.createElement('div');
    hint.className = 'places-hint';
    hint.textContent = 'Start typing an NSW address and select a suggestion.';
    (wrap || addressInput.parentElement).insertAdjacentElement('afterend', hint);
  }
  const hint = document.querySelector('.places-hint');

  const list = document.createElement('div');
  list.className = 'places-suggestions hidden';
  list.setAttribute('role', 'listbox');
  (wrap || addressInput.parentElement).insertAdjacentElement('afterend', list);

  function hideSuggestions() {
    list.classList.add('hidden');
    list.replaceChildren();
  }

  function stripAustralia(value = '') {
    return value.replace(/,?\s*Australia\s*$/i, '').trim();
  }

  function component(place, type) {
    return place.addressComponents?.find(c => c.types?.includes(type));
  }

  function selectedState(place) {
    return component(place, 'administrative_area_level_1')?.shortText || '';
  }

  function selectedCountry(place) {
    return component(place, 'country')?.shortText || '';
  }

  function clearValidation() {
    delete addressInput.dataset.mapsValidated;
    delete addressInput.dataset.mapsState;
    delete addressInput.dataset.mapsLatitude;
    delete addressInput.dataset.mapsLongitude;
  }

  function loadGoogleMaps() {
    if (window.google?.maps?.importLibrary) return Promise.resolve();
    if (window.__schedulePlusGoogleMapsPromise) return window.__schedulePlusGoogleMapsPromise;

    window.__schedulePlusGoogleMapsPromise = new Promise((resolve, reject) => {
      if (typeof GOOGLE_MAPS_API_KEY === 'undefined' || !GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY.includes('YOUR_API_KEY')) {
        reject(new Error('Google Maps API key is not configured.'));
        return;
      }
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&v=weekly&loading=async`;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Google Maps could not be loaded.'));
      document.head.appendChild(script);
    });
    return window.__schedulePlusGoogleMapsPromise;
  }

  async function getPlacesApi() {
    if (placesApi) return placesApi;
    await loadGoogleMaps();
    placesApi = await google.maps.importLibrary('places');
    return placesApi;
  }

  async function showSuggestions() {
    const input = addressInput.value.trim();
    if (input.length < 3) {
      hideSuggestions();
      return;
    }

    try {
      const { AutocompleteSuggestion, AutocompleteSessionToken } = await getPlacesApi();
      if (!sessionToken) sessionToken = new AutocompleteSessionToken();

      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        includedRegionCodes: ['au'],
        locationRestriction: NSW_BOUNDS,
        language: 'en-AU',
        region: 'au',
        sessionToken
      });

      list.replaceChildren();
      const predictions = (suggestions || []).map(s => s.placePrediction).filter(Boolean);
      if (!predictions.length) {
        const empty = document.createElement('div');
        empty.className = 'places-empty';
        empty.textContent = 'No NSW addresses found.';
        list.appendChild(empty);
        list.classList.remove('hidden');
        return;
      }

      predictions.slice(0, 6).forEach(prediction => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'places-suggestion';
        button.setAttribute('role', 'option');
        button.textContent = prediction.text?.toString?.() || '';
        button.addEventListener('mousedown', e => e.preventDefault());
        button.addEventListener('click', async () => {
          try {
            const place = prediction.toPlace();
            await place.fetchFields({ fields: ['formattedAddress', 'addressComponents', 'location'] });

            if (selectedCountry(place) !== 'AU' || selectedState(place) !== 'NSW') {
              hideSuggestions();
              alert('Please select an address in New South Wales.');
              return;
            }

            addressInput.value = stripAustralia(place.formattedAddress || prediction.text?.toString?.() || '');
            addressInput.dataset.mapsValidated = 'true';
            addressInput.dataset.mapsState = 'NSW';
            if (place.location) {
              addressInput.dataset.mapsLatitude = String(place.location.lat());
              addressInput.dataset.mapsLongitude = String(place.location.lng());
            }
            sessionToken = null;
            hideSuggestions();
          } catch (error) {
            console.error(error);
            alert('That address could not be loaded. Please try another suggestion.');
          }
        });
        list.appendChild(button);
      });
      list.classList.remove('hidden');
    } catch (error) {
      console.error(error);
      hideSuggestions();
      if (hint) hint.textContent = 'Google address lookup is temporarily unavailable. You can still type an NSW address manually.';
    }
  }

  addressInput.setAttribute('autocomplete', 'off');
  addressInput.addEventListener('input', () => {
    clearValidation();
    clearTimeout(suggestionTimer);
    suggestionTimer = setTimeout(showSuggestions, 220);
  });
  addressInput.addEventListener('focus', () => {
    if (addressInput.value.trim().length >= 3) showSuggestions();
  });
  addressInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideSuggestions();
  });
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('.places-address-wrap') && !e.target.closest('.places-suggestions')) hideSuggestions();
  });

  jobForm.addEventListener('submit', e => {
    const value = addressInput.value.trim();
    const nonNswState = value.match(/\b(VIC|QLD|SA|WA|TAS|ACT|NT)\b/i);
    if (nonNswState || (addressInput.dataset.mapsState && addressInput.dataset.mapsState !== 'NSW')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      alert('Schedule+ only accepts New South Wales addresses.');
      addressInput.focus();
    }
  }, true);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`./sw.js?v=${UI_VERSION}`, { updateViaCache: 'none' }).then(reg => reg.update()).catch(() => {});
  }
})();
