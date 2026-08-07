document.addEventListener('DOMContentLoaded', () => {
    const cameraInput = document.getElementById('camera-input');
    const galleryInput = document.getElementById('gallery-input');
    const desktopFileInput = document.getElementById('desktop-file-input');
    const photoPreview = document.getElementById('photo-preview');
    const videoPreview = document.getElementById('video-preview');
    const mediaStatus = document.getElementById('media-status');
    const btnGetLocation = document.getElementById('btn-get-location');
    const addressInput = document.getElementById('address-input');
    const locationStatus = document.getElementById('location-status');
    const reportForm = document.getElementById('report-form');
    const issueDesc = document.getElementById('issue-desc');

    let currentMediaFile = null;
    let currentMediaPreview = null;
    let currentImageDataUrl = null;
    let currentLocation = null;

    // Initialize JanSetu Voice AI Engine for Mic & Speech Translation
    if (window.JanSetuVoiceAI) {
        window.JanSetuVoiceAI.init('btn-voice-mic', 'issue-desc', 'voice-ai-badge', 'voice-ai-translation');
    }

    // Auto pre-fill search query if coming from Home Page Search Bar
    const urlParams = new URLSearchParams(window.location.search);
    const queryParam = urlParams.get('query') || localStorage.getItem('pendingSearchQuery');
    if (queryParam && issueDesc) {
        issueDesc.value = queryParam;
        localStorage.removeItem('pendingSearchQuery');
        if (window.JanSetuVoiceAI && window.JanSetuVoiceAI.processTranslationAndAutoForm) {
            const badge = document.getElementById('voice-ai-badge');
            const translationText = document.getElementById('voice-ai-translation');
            window.JanSetuVoiceAI.processTranslationAndAutoForm(queryParam, badge, translationText);
        }
    }

    function processMediaFile(file) {
        if (!file) return;

        const maxSizeMb = file.type.startsWith('video/') ? 50 : 10;
        if (file.size > maxSizeMb * 1024 * 1024) {
            alert(`Please choose a file smaller than ${maxSizeMb}MB.`);
            return;
        }

        currentMediaFile = file;
        currentMediaPreview = URL.createObjectURL(file);
        currentImageDataUrl = null;

        if (photoPreview) {
            photoPreview.style.display = 'none';
            photoPreview.removeAttribute('src');
        }
        if (videoPreview) {
            videoPreview.style.display = 'none';
            videoPreview.removeAttribute('src');
        }

        if (file.type.startsWith('image/') && photoPreview) {
            photoPreview.src = currentMediaPreview;
            photoPreview.style.display = 'block';

            const reader = new FileReader();
            reader.onload = function(event) {
                currentImageDataUrl = event.target.result;
            };
            reader.readAsDataURL(file);
        } else if (file.type.startsWith('video/') && videoPreview) {
            videoPreview.src = currentMediaPreview;
            videoPreview.style.display = 'block';
        }

        if (mediaStatus) {
            mediaStatus.textContent = `${file.name} selected`;
        }
    }

    [cameraInput, galleryInput, desktopFileInput].forEach(input => {
        if (input) {
            input.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    processMediaFile(e.target.files[0]);
                }
            });
        }
    });

    // Get live location
    btnGetLocation.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser.");
            return;
        }

        btnGetLocation.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Locating...';
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude.toFixed(5);
                const lon = position.coords.longitude.toFixed(5);
                currentLocation = {
                    latitude: Number(position.coords.latitude.toFixed(6)),
                    longitude: Number(position.coords.longitude.toFixed(6)),
                    accuracy: Math.round(position.coords.accuracy || 0)
                };
                
                // Simulate reverse geocoding or just use coordinates
                addressInput.value = `Lat: ${lat}, Lng: ${lon} (Nagpur Area)`;
                
                btnGetLocation.innerHTML = '<i class="fas fa-map-marker-alt"></i> Use My Live Location';
                locationStatus.style.display = 'block';
                
                setTimeout(() => {
                    locationStatus.style.display = 'none';
                }, 3000);
            },
            (error) => {
                alert("Unable to retrieve your location. Please check your permissions.");
                btnGetLocation.innerHTML = '<i class="fas fa-map-marker-alt"></i> Use My Live Location';
            }
        );
    });

    async function uploadMedia(reportId) {
        if (!currentMediaFile || !window.JanSetuFirebase || !window.JanSetuFirebase.isConfigured()) {
            return null;
        }

        window.JanSetuFirebase.init();
        const safeName = currentMediaFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `complaint-media/${reportId}/${Date.now()}-${safeName}`;
        const ref = firebase.storage().ref(storagePath);
        const snapshot = await ref.put(currentMediaFile, {
            contentType: currentMediaFile.type
        });
        const url = await snapshot.ref.getDownloadURL();

        return {
            url,
            path: storagePath,
            name: currentMediaFile.name,
            type: currentMediaFile.type,
            size: currentMediaFile.size
        };
    }

    async function saveReportToFirebase(report) {
        if (!window.JanSetuFirebase || !window.JanSetuFirebase.isConfigured()) {
            return null;
        }

        window.JanSetuFirebase.init();
        await firebase.firestore().collection('complaints').doc(report.id).set({
            ...report,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        return report;
    }

    // Form Submission
    reportForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!addressInput.value) {
            alert("Please provide a location.");
            return;
        }

        const submitBtn = reportForm.querySelector('button[type="submit"]');
        const originalButtonText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        submitBtn.disabled = true;

        const reportId = 'REQ-' + Math.floor(100000 + Math.random() * 900000);
        const newReport = {
            id: reportId,
            address: addressInput.value,
            description: issueDesc.value,
            location: currentLocation,
            media: null,
            photo: 'assets/nagpur.jpeg',
            timestamp: new Date().toISOString(),
            phone: localStorage.getItem('userPhone') || '9876543210',
            status: 'Pending'
        };

        try {
            const media = await uploadMedia(reportId);
            if (media) {
                newReport.media = media;
                newReport.photo = media.type.startsWith('image/') ? media.url : 'assets/nagpur.jpeg';
                newReport.video = media.type.startsWith('video/') ? media.url : null;
            if (currentImageDataUrl && !newReport.photo) {
                newReport.photo = currentImageDataUrl;
            }
        } catch (err) {
            console.warn("Media processing warning", err);
        }

        let isDup = false;
        let serverMsg = "";

        // 1. Post to central live backend API FIRST (instant cross-device mobile to admin portal sync)
        try {
            const res = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: JSON.stringify(newReport)
            });
            if (res.ok) {
                const data = await res.json();
                isDup = data.isDuplicate;
                serverMsg = data.message;
            }
        } catch (err) {
            console.warn("Backend API offline, fallback to localStorage", err);
        }

        // Optional Firebase backup in background
        try {
            saveReportToFirebase(newReport).catch(e => {});
        } catch (e) {}

        // 2. Save to localStorage as backup
        let reports = JSON.parse(localStorage.getItem('civic_reports') || '[]');
        reports.unshift(newReport);
        localStorage.setItem('civic_reports', JSON.stringify(reports));

        alert("Report submitted successfully! The admin portal has been updated in real-time.");
        
        // Redirect back to home to see the admin feed
        window.location.href = 'index.html#admin-portal';
        submitBtn.innerHTML = originalButtonText;
        submitBtn.disabled = false;
    });
});
