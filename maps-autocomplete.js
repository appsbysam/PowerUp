(() => {
  const NSW_BOUNDS = { west: 140.999, south: -37.6, east: 153.7, north: -28.1 };
  const sourceInput = document.getElementById('addressLine');
  const lookupButton = document.getElementById('mapsLookupBtn');
  const jobForm = document.getElementById('jobForm');
  if (!sourceInput || !jobForm) return;

  if (lookupButton) lookupButton.hidden = true;
  sourceInput.autocomplete = 'off';
  const wrap = sourceInput.closest('.address-row') || sourceInput.parentElement;
  if (wrap) wrap.classList.add('places-address-wrap');

  let resultsBox = document.getElementById('googleAddressSuggestions');
  if (!resultsBox) {
    resultsBox = document.createElement('div');
    resultsBox.id = 'googleAddressSuggestions';
    resultsBox.className = 'address-suggestions hidden';
    resultsBox.setAttribute('role', 'listbox');
    (wrap || sourceInput.parentElement).insertAdjacentElement('afterend', resultsBox);
  }

  let hint = document.querySelector('.places-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'places-hint';
    resultsBox.insertAdjacentElement('afterend', hint);
  }
  hint.textContent = 'Start typing an NSW address.';

  function stripAustralia(value = '') {
    return value.replace(/,?\s*Australia\s*$/i, '').trim();
  }
  function component(place, type) {
    return place.addressComponents?.find(c => c.types?.includes(type));
  }
  function clearValidation() {
    delete sourceInput.dataset.mapsValidated;
    delete sourceInput.dataset.mapsState;
    delete sourceInput.dataset.mapsSuburb;
    delete sourceInput.dataset.mapsPostcode;
    delete sourceInput.dataset.mapsLatitude;
    delete sourceInput.dataset.mapsLongitude;
  }
  function errorText(error) {
    const raw = String(error?.code || error?.message || error?.status || 'unknown error');
    return raw.replace(/AIza[\w-]+/g, '[key hidden]').slice(0, 180);
  }
  function hideResults() {
    resultsBox.classList.add('hidden');
    resultsBox.innerHTML = '';
    activeIndex = -1;
  }

  function installGoogleBootstrap() {
    if (window.google?.maps?.importLibrary) return;
    if (typeof GOOGLE_MAPS_API_KEY === 'undefined' || !GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY.includes('YOUR_API_KEY')) {
      throw new Error('API key not configured');
    }

    ((g) => {
      let h, a, k;
      const p = 'The Google Maps JavaScript API';
      const c = 'google';
      const l = 'importLibrary';
      const q = '__ib__';
      const m = document;
      let b = window;
      b = b[c] || (b[c] = {});
      const d = b.maps || (b.maps = {});
      const r = new Set();
      const e = new URLSearchParams();
      const u = () => h || (h = new Promise(async (f, n) => {
        await (a = m.createElement('script'));
        e.set('libraries', [...r] + '');
        for (k in g) e.set(k.replace(/[A-Z]/g, t => '_' + t[0].toLowerCase()), g[k]);
        e.set('callback', c + '.maps.' + q);
        a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
        d[q] = f;
        a.onerror = () => h = n(Error(p + ' could not load.'));
        a.nonce = m.querySelector('script[nonce]')?.nonce || '';
        m.head.append(a);
      }));
      d[l] ? console.warn(p + ' only loads once. Ignoring:', g) : d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n));
    })({ key: GOOGLE_MAPS_API_KEY, v: 'weekly', language: 'en', region: 'AU' });
  }

  let placesLibrary = null;
  let sessionToken = null;
  let debounceTimer = null;
  let requestSequence = 0;
  let predictions = [];
  let activeIndex = -1;

  async function ensurePlaces() {
    if (placesLibrary) return placesLibrary;
    installGoogleBootstrap();
    placesLibrary = await google.maps.importLibrary('places');
    if (!placesLibrary?.AutocompleteSuggestion || !placesLibrary?.AutocompleteSessionToken) {
      throw new Error('Google Autocomplete Data API unavailable');
    }
    sessionToken = new placesLibrary.AutocompleteSessionToken();
    return placesLibrary;
  }

  function renderPredictions(items) {
    predictions = items;
    activeIndex = -1;
    if (!items.length) {
      resultsBox.innerHTML = '<div class="address-suggestion-empty">No matching NSW addresses found.</div>';
      resultsBox.classList.remove('hidden');
      return;
    }
    resultsBox.innerHTML = items.map((prediction, index) => {
      const text = prediction.text?.toString?.() || '';
      return `<button class="address-suggestion" type="button" role="option" data-index="${index}"><span class="address-pin">⌖</span><span>${text.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}</span></button>`;
    }).join('');
    resultsBox.classList.remove('hidden');
    resultsBox.querySelectorAll('.address-suggestion').forEach(btn => {
      btn.addEventListener('mousedown', e => e.preventDefault());
      btn.addEventListener('click', () => selectPrediction(Number(btn.dataset.index)));
    });
  }

  async function searchAddress() {
    const input = sourceInput.value.trim();
    const sequence = ++requestSequence;
    if (input.length < 3) {
      hideResults();
      hint.textContent = 'Start typing an NSW address.';
      hint.classList.remove('ok', 'error');
      return;
    }
    try {
      const places = await ensurePlaces();
      hint.textContent = 'Searching Google addresses…';
      hint.classList.remove('ok', 'error');
      const { suggestions = [] } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        includedRegionCodes: ['au'],
        locationRestriction: NSW_BOUNDS,
        sessionToken
      });
      if (sequence !== requestSequence) return;
      const items = suggestions.map(s => s.placePrediction).filter(Boolean);
      renderPredictions(items);
      hint.textContent = items.length ? 'Select the correct NSW address.' : 'No matching NSW addresses found.';
    } catch (error) {
      if (sequence !== requestSequence) return;
      console.error('Google address search failed', error);
      hideResults();
      hint.textContent = `Google address search failed: ${errorText(error)}`;
      hint.classList.remove('ok');
      hint.classList.add('error');
    }
  }

  async function selectPrediction(index) {
    const prediction = predictions[index];
    if (!prediction) return;
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'addressComponents', 'location'] });
      const state = component(place, 'administrative_area_level_1')?.shortText || '';
      const country = component(place, 'country')?.shortText || '';
      if (country !== 'AU' || state !== 'NSW') {
        clearValidation();
        hint.textContent = 'Please select an address in New South Wales.';
        hint.classList.add('error');
        hideResults();
        return;
      }

      const value = stripAustralia(place.formattedAddress || prediction.text?.toString?.() || '');
      const suburb = component(place, 'locality')?.longText || component(place, 'postal_town')?.longText || component(place, 'sublocality')?.longText || '';
      const postcode = component(place, 'postal_code')?.longText || '';
      sourceInput.value = value;
      sourceInput.dataset.mapsValidated = 'true';
      sourceInput.dataset.mapsState = 'NSW';
      sourceInput.dataset.mapsSuburb = suburb;
      sourceInput.dataset.mapsPostcode = postcode;
      if (place.location) {
        sourceInput.dataset.mapsLatitude = String(place.location.lat());
        sourceInput.dataset.mapsLongitude = String(place.location.lng());
      }
      hideResults();
      hint.textContent = 'NSW address selected.';
      hint.classList.remove('error');
      hint.classList.add('ok');
      if (placesLibrary?.AutocompleteSessionToken) sessionToken = new placesLibrary.AutocompleteSessionToken();
    } catch (error) {
      console.error('Google address selection failed', error);
      hint.textContent = `Google address selection failed: ${errorText(error)}`;
      hint.classList.remove('ok');
      hint.classList.add('error');
    }
  }

  function updateActiveSuggestion(next) {
    const buttons = [...resultsBox.querySelectorAll('.address-suggestion')];
    if (!buttons.length) return;
    activeIndex = (next + buttons.length) % buttons.length;
    buttons.forEach((btn, i) => btn.classList.toggle('active', i === activeIndex));
    buttons[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }

  sourceInput.addEventListener('input', () => {
    clearValidation();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(searchAddress, 220);
  });
  sourceInput.addEventListener('keydown', e => {
    if (resultsBox.classList.contains('hidden')) return;
    const count = resultsBox.querySelectorAll('.address-suggestion').length;
    if (e.key === 'ArrowDown' && count) { e.preventDefault(); updateActiveSuggestion(activeIndex + 1); }
    else if (e.key === 'ArrowUp' && count) { e.preventDefault(); updateActiveSuggestion(activeIndex <= 0 ? count - 1 : activeIndex - 1); }
    else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); selectPrediction(activeIndex); }
    else if (e.key === 'Escape') hideResults();
  });
  sourceInput.addEventListener('focus', () => {
    if (sourceInput.value.trim().length >= 3 && predictions.length) resultsBox.classList.remove('hidden');
  });
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('.places-address-wrap') && !e.target.closest('#googleAddressSuggestions')) hideResults();
  });

  jobForm.addEventListener('submit', e => {
    const value = sourceInput.value.trim();
    const nonNswState = value.match(/\b(VIC|QLD|SA|WA|TAS|ACT|NT)\b/i);
    if (nonNswState || (sourceInput.dataset.mapsState && sourceInput.dataset.mapsState !== 'NSW')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      alert('Schedule+ only accepts New South Wales addresses.');
      sourceInput.focus();
    }
  }, true);

  window.SchedulePlusAddress = {
    syncFromSource() {
      clearValidation();
      hideResults();
      hint.textContent = 'Start typing an NSW address.';
      hint.classList.remove('ok', 'error');
    }
  };

  ensurePlaces().catch(error => {
    console.error('Google Places setup failed', error);
    hint.textContent = `Google address search is unavailable (${errorText(error)}).`;
    hint.classList.add('error');
  });
})();
