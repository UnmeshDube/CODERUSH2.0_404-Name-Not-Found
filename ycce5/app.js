const statusEl = document.getElementById('status');
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const languageInputs = document.querySelectorAll('input[name="languageChoice"]');
const photoDropzone = document.getElementById('photoDropzone');
const issuePhotoInput = document.getElementById('issuePhotoInput');
const issuePhotoPreview = document.getElementById('issuePhotoPreview');
const locateBtn = document.getElementById('locateBtn');
const locationAddressField = document.getElementById('locationAddressField');
const analyzeBtn = document.getElementById('analyzeBtn');
const previewCard = document.getElementById('previewCard');
const submitFinalBtn = document.getElementById('submitFinalBtn');

let mediaRecorder;
let recordedChunks = [];
let voiceTranscript = '';
let selectedImageBase64 = null;
let currentLocation = { lat: null, lng: null, address: '' };
let finalReportData = null;

let map;
let marker;

// Initialize Map
function initMap() {
  map = L.map('location-map').setView([21.1458, 79.0882], 13); // Nagpur center
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  // Force map to recalculate its size after rendering
  setTimeout(() => {
    if (map) {
      map.invalidateSize({ animate: false });
      map.setView(map.getCenter(), map.getZoom());
    }
  }, 100);

  map.on('click', async (e) => {
    setLocation(e.latlng.lat, e.latlng.lng);
  });
  
  // Handle map resizing
  window.addEventListener('resize', () => {
    if (map) {
      clearTimeout(map.resizeTimer);
      map.resizeTimer = setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }
  });

  const mapFrame = document.querySelector('.map-frame');
  if (mapFrame) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && map) {
          map.invalidateSize();
        }
      });
    });
    observer.observe(mapFrame);
  }
}

async function setLocation(lat, lng) {
  currentLocation.lat = lat;
  currentLocation.lng = lng;
  
  if (!marker) {
    marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    marker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      setLocation(pos.lat, pos.lng);
    });
  } else {
    marker.setLatLng([lat, lng]);
  }
  
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
    const data = await res.json();
    currentLocation.address = data.display_name || `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
    locationAddressField.value = currentLocation.address;
  } catch (err) {
    currentLocation.address = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
    locationAddressField.value = currentLocation.address;
  }
  checkAnalyzeReady();
}

locateBtn.addEventListener('click', () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      setLocation(pos.coords.latitude, pos.coords.longitude);
      map.setView([pos.coords.latitude, pos.coords.longitude], 16);
    }, () => {
      alert("Could not get location. Please click on the map manually.");
    });
  }
});

// Location Search via Photon API
const locationSearchInput = document.getElementById('locationSearchInput');
const searchResults = document.getElementById('searchResults');
let searchTimeout;

if (locationSearchInput && searchResults) {
  locationSearchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    
    if (query.length < 3) {
      searchResults.hidden = true;
      return;
    }
    
    searchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=21.1458&lon=79.0882&location_bias_scale=0.9&limit=5`);
        const data = await res.json();
        
        searchResults.innerHTML = '';
        if (data.features && data.features.length > 0) {
          data.features.forEach(feature => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            const props = feature.properties;
            const primary = props.name || props.street || props.city || props.state || "Location";
            const secondary = [props.city, props.state, props.postcode].filter(Boolean).join(', ');
            item.innerHTML = `<strong>${primary}</strong><span>${secondary}</span>`;
            
            item.addEventListener('click', () => {
              const [lng, lat] = feature.geometry.coordinates;
              setLocation(lat, lng);
              map.setView([lat, lng], 16);
              locationSearchInput.value = primary;
              searchResults.hidden = true;
            });
            searchResults.appendChild(item);
          });
          searchResults.hidden = false;
        } else {
          searchResults.hidden = true;
        }
      } catch (err) {
        console.error('Search failed:', err);
        searchResults.hidden = true;
      }
    }, 300);
  });

  document.addEventListener('click', (e) => {
    if (e.target !== locationSearchInput && e.target !== searchResults) {
      searchResults.hidden = true;
    }
  });
}

// Photo Upload Logic
photoDropzone.addEventListener('click', () => issuePhotoInput.click());
issuePhotoInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      selectedImageBase64 = ev.target.result;
      issuePhotoPreview.innerHTML = `<img src="${selectedImageBase64}" style="max-width: 100%; max-height: 200px; border-radius: 8px;" />`;
      checkAnalyzeReady();
    };
    reader.readAsDataURL(file);
  }
});

function getSelectedLanguage() {
  const checked = document.querySelector('input[name="languageChoice"]:checked');
  return checked ? checked.value : '';
}

function syncSelectionState() {
  const selectedLanguage = getSelectedLanguage();
  recordBtn.disabled = !selectedLanguage || (mediaRecorder && mediaRecorder.state === 'recording');
  if (!selectedLanguage) {
    stopBtn.disabled = true;
    statusEl.textContent = 'Select a language to continue.';
    return;
  }
  if (!mediaRecorder || mediaRecorder.state !== 'recording') {
    statusEl.textContent = `Selected language: ${selectedLanguage}. Ready to record.`;
  }
}

function log(msg) {
  statusEl.textContent = msg;
}

async function startRecording() {
  const selectedLanguage = getSelectedLanguage();
  if (!selectedLanguage) {
    log('Please select a language before recording.');
    return;
  }

  recordedChunks = [];
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstart = () => {
      recordBtn.disabled = true;
      stopBtn.disabled = false;
      log(`Recording in ${selectedLanguage}...`);
    };
    mediaRecorder.onstop = async () => {
      recordBtn.disabled = false;
      stopBtn.disabled = true;
      log('Uploading and processing audio...');
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      await uploadAudio(blob, selectedLanguage);
      stream.getTracks().forEach((track) => track.stop());
    };
    mediaRecorder.start();
  } catch (err) {
    log('Could not start microphone: ' + err.message);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

async function uploadAudio(blob, selectedLanguage) {
  const fd = new FormData();
  fd.append('audio', blob, `rec-${Date.now()}.webm`);
  fd.append('selected_language', selectedLanguage);

  try {
    const res = await fetch('http://127.0.0.1:8090/process_audio', {
      method: 'POST',
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');
    // Save transcript (assuming process_audio returns text field in transcription)
    voiceTranscript = data.transcript || data.text || JSON.stringify(data);
    
    const transcriptContainer = document.getElementById('voice-transcript-container');
    const transcriptPreview = document.getElementById('voice-transcript-preview');
    if (transcriptContainer && transcriptPreview) {
      transcriptPreview.value = voiceTranscript;
      transcriptContainer.style.display = 'block';
    }
    
    log('Audio processed. Please add photo and location.');
    checkAnalyzeReady();
  } catch (err) {
    log('Audio processing failed: ' + err.message);
  }
}

function checkAnalyzeReady() {
  if (voiceTranscript && selectedImageBase64 && currentLocation.lat) {
    analyzeBtn.disabled = false;
  }
}

analyzeBtn.addEventListener('click', async () => {
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Analyzing...';
  
  try {
    const res = await fetch('http://127.0.0.1:8090/analyze_complaint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: voiceTranscript,
        image: selectedImageBase64,
        location: currentLocation
      })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Analysis failed');
    
    finalReportData = data;
    
    document.getElementById('previewHeading').textContent = data.heading || 'Civic Issue';
    document.getElementById('previewCategory').textContent = data.category || 'Unknown';
    document.getElementById('previewDescription').textContent = data.description || '';
    document.getElementById('previewLocationText').textContent = data.location?.address || currentLocation.address;
    
    previewCard.hidden = false;
    analyzeBtn.textContent = 'Analyze Complaint';
    analyzeBtn.disabled = false;
  } catch (err) {
    alert(err.message);
    analyzeBtn.textContent = 'Analyze Complaint';
    analyzeBtn.disabled = false;
  }
});

submitFinalBtn.addEventListener('click', async () => {
  if (!finalReportData) return;
  
  submitFinalBtn.disabled = true;
  submitFinalBtn.textContent = 'Submitting...';
  
  const payload = {
    title: finalReportData.heading,
    description: finalReportData.description,
    category: finalReportData.category,
    address: finalReportData.location?.address || currentLocation.address,
    location: { lat: currentLocation.lat, lng: currentLocation.lng },
    photo: finalReportData.image || selectedImageBase64,
    timestamp: new Date().toISOString()
  };
  
  try {
    const res = await fetch('http://localhost:8000/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) throw new Error('Submission failed');
    
    alert('Report submitted successfully!');
    window.location.reload();
  } catch (err) {
    alert(err.message);
    submitFinalBtn.textContent = 'Submit Report';
    submitFinalBtn.disabled = false;
  }
});

languageInputs.forEach((input) => input.addEventListener('change', syncSelectionState));
recordBtn.addEventListener('click', () => startRecording());
stopBtn.addEventListener('click', () => stopRecording());

window.addEventListener('load', () => {
  syncSelectionState();
  initMap();
});
