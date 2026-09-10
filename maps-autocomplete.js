(() => {
  const NSW_BOUNDS = { west: 140.999, south: -37.6, east: 153.7, north: -28.1 };
  let sessionToken = null;
  let suggestionTimer = null;
  let placesApi = null;

  const addressInput = document.getElementById('addressLine');
  const lookupButton = document.getElementById('mapsLookupBtn');
  const jobForm = document.getElementById('jobForm');
  if (!addressInput || !jobForm) return;

  if (lookupButton) lookupButton.hidden = true;

  const wrap = addressInput.closest('.address-row') || addressInput.parentElement;
  if (wrap) wrap.classList.add('places-address-wrap');

  const hint = document.createElement('div');
  hint.className = 'places-hint';
  hint.textContent = 'Start typing an NSW address and select a suggestion.';
  (wrap || addressInput.parentElement).insertAdjacentElement('afterend', hint);

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
      hint.textContent = 'Google address lookup is temporarily unavailable. You can still type an NSW address manually.';
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
})();
