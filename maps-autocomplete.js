(() => {
  const NSW_BOUNDS = { west: 140.999, south: -37.6, east: 153.7, north: -28.1 };
  const sourceInput = document.getElementById('addressLine');
  const lookupButton = document.getElementById('mapsLookupBtn');
  const jobForm = document.getElementById('jobForm');
  if (!sourceInput || !jobForm) return;

  if (lookupButton) lookupButton.hidden = true;

  const wrap = sourceInput.closest('.address-row') || sourceInput.parentElement;
  if (wrap) wrap.classList.add('places-address-wrap');

  const hint = document.createElement('div');
  hint.className = 'places-hint';
  hint.textContent = 'Start typing an NSW address and select a Google suggestion.';
  (wrap || sourceInput.parentElement).insertAdjacentElement('afterend', hint);

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

  function loadGoogleMaps() {
    if (window.google?.maps?.importLibrary) return Promise.resolve();
    if (window.__schedulePlusGoogleMapsPromise) return window.__schedulePlusGoogleMapsPromise;

    window.__schedulePlusGoogleMapsPromise = new Promise((resolve, reject) => {
      if (typeof GOOGLE_MAPS_API_KEY === 'undefined' || !GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY.includes('YOUR_API_KEY')) {
        reject(new Error('Google Maps API key is not configured.'));
        return;
      }
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=places&v=weekly&loading=async&language=en&region=AU`;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Google Maps JavaScript API could not be loaded.'));
      document.head.appendChild(script);
    });
    return window.__schedulePlusGoogleMapsPromise;
  }

  let autocomplete = null;

  async function initialiseAutocomplete() {
    try {
      await loadGoogleMaps();
      const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
      autocomplete = new PlaceAutocompleteElement({
        includedRegionCodes: ['au'],
        locationRestriction: NSW_BOUNDS,
        requestedLanguage: 'en-AU',
        requestedRegion: 'au',
        placeholder: 'Start typing an NSW address',
        value: sourceInput.value || ''
      });
      autocomplete.id = 'googleAddressAutocomplete';
      autocomplete.className = 'google-address-autocomplete';
      autocomplete.setAttribute('aria-label', 'Address');

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
          hint.textContent = 'That address could not be loaded. Please try another suggestion.';
          hint.classList.add('error');
        }
      });

      autocomplete.addEventListener('gmp-error', event => {
        console.error('Google Places autocomplete error', event);
        hint.textContent = 'Google address search could not load. Check the Maps/Places API restrictions.';
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
      hint.textContent = 'Google address search is unavailable. Check the Maps JavaScript API and Places API (New) settings.';
      hint.classList.add('error');
      sourceInput.classList.remove('places-source-input');
      sourceInput.removeAttribute('aria-hidden');
      sourceInput.tabIndex = 0;
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
