(() => {
  const NSW_BOUNDS = { west: 140.999, south: -37.6, east: 153.7, north: -28.1 };
  const sourceInput = document.getElementById('addressLine');
  const lookupButton = document.getElementById('mapsLookupBtn');
  const jobForm = document.getElementById('jobForm');
  if (!sourceInput || !jobForm) return;

  if (lookupButton) lookupButton.hidden = true;
  const wrap = sourceInput.closest('.address-row') || sourceInput.parentElement;
  if (wrap) wrap.classList.add('places-address-wrap');

  let hint = document.querySelector('.places-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'places-hint';
    (wrap || sourceInput.parentElement).insertAdjacentElement('afterend', hint);
  }
  hint.textContent = 'Start typing an NSW address and select a Google suggestion.';

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
  function showSourceInput() {
    sourceInput.classList.remove('places-source-input');
    sourceInput.removeAttribute('aria-hidden');
    sourceInput.tabIndex = 0;
  }
  function errorText(error) {
    const raw = String(error?.code || error?.message || 'unknown error');
    return raw.replace(/AIza[\w-]+/g, '[key hidden]').slice(0, 160);
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
    })({
      key: GOOGLE_MAPS_API_KEY,
      v: 'weekly',
      language: 'en',
      region: 'AU'
    });
  }

  let autocomplete = null;

  async function initialiseAutocomplete() {
    try {
      installGoogleBootstrap();
      const places = await google.maps.importLibrary('places');
      const PlaceAutocompleteElement = places?.PlaceAutocompleteElement;
      if (!PlaceAutocompleteElement) throw new Error('PlaceAutocompleteElement unavailable');

      autocomplete = new PlaceAutocompleteElement();
      autocomplete.id = 'googleAddressAutocomplete';
      autocomplete.className = 'google-address-autocomplete';
      autocomplete.includedRegionCodes = ['au'];
      autocomplete.locationRestriction = NSW_BOUNDS;
      autocomplete.placeholder = 'Start typing an NSW address';
      autocomplete.setAttribute('aria-label', 'Address');
      if (sourceInput.value) autocomplete.value = sourceInput.value;

      sourceInput.classList.add('places-source-input');
      sourceInput.setAttribute('aria-hidden', 'true');
      sourceInput.tabIndex = -1;
      sourceInput.insertAdjacentElement('beforebegin', autocomplete);

      autocomplete.addEventListener('input', () => {
        sourceInput.value = autocomplete.value || '';
        clearValidation();
        hint.textContent = 'Select a Google suggestion to confirm the NSW address.';
        hint.classList.remove('ok', 'error');
      });

      autocomplete.addEventListener('gmp-select', async event => {
        try {
          const prediction = event.placePrediction;
          if (!prediction) return;
          const place = prediction.toPlace();
          await place.fetchFields({ fields: ['formattedAddress', 'addressComponents', 'location'] });
          const state = component(place, 'administrative_area_level_1')?.shortText || '';
          const country = component(place, 'country')?.shortText || '';
          if (country !== 'AU' || state !== 'NSW') {
            clearValidation();
            hint.textContent = 'Please select an address in New South Wales.';
            hint.classList.add('error');
            alert('Schedule+ only accepts New South Wales addresses.');
            return;
          }

          const value = stripAustralia(place.formattedAddress || prediction.text?.toString?.() || '');
          const suburb = component(place, 'locality')?.longText || component(place, 'postal_town')?.longText || component(place, 'sublocality')?.longText || '';
          const postcode = component(place, 'postal_code')?.longText || '';
          sourceInput.value = value;
          autocomplete.value = value;
          sourceInput.dataset.mapsValidated = 'true';
          sourceInput.dataset.mapsState = 'NSW';
          sourceInput.dataset.mapsSuburb = suburb;
          sourceInput.dataset.mapsPostcode = postcode;
          if (place.location) {
            sourceInput.dataset.mapsLatitude = String(place.location.lat());
            sourceInput.dataset.mapsLongitude = String(place.location.lng());
          }
          hint.textContent = 'NSW address selected.';
          hint.classList.remove('error');
          hint.classList.add('ok');
        } catch (error) {
          console.error('Google address selection failed', error);
          hint.textContent = `Google address selection failed: ${errorText(error)}`;
          hint.classList.add('error');
        }
      });

      autocomplete.addEventListener('gmp-error', event => {
        console.error('Google Places autocomplete error', event);
        hint.textContent = 'Google address search was rejected by Google. Check the API key restrictions and billing.';
        hint.classList.remove('ok');
        hint.classList.add('error');
      });

      window.SchedulePlusAddress = {
        syncFromSource() {
          if (autocomplete) autocomplete.value = sourceInput.value || '';
          clearValidation();
          hint.textContent = 'Start typing an NSW address and select a Google suggestion.';
          hint.classList.remove('ok', 'error');
        }
      };
    } catch (error) {
      console.error('Google Places setup failed', error);
      showSourceInput();
      hint.textContent = `Google address search is unavailable (${errorText(error)}).`;
      hint.classList.remove('ok');
      hint.classList.add('error');
    }
  }

  jobForm.addEventListener('submit', e => {
    const value = sourceInput.value.trim();
    const nonNswState = value.match(/\b(VIC|QLD|SA|WA|TAS|ACT|NT)\b/i);
    if (nonNswState || (sourceInput.dataset.mapsState && sourceInput.dataset.mapsState !== 'NSW')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      alert('Schedule+ only accepts New South Wales addresses.');
      autocomplete?.focus?.();
    }
  }, true);

  initialiseAutocomplete();
})();
