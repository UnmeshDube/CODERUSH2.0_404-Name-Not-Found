// Basic interactions for CivicResolve AI Landing Page

document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu Toggle
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (mobileBtn && navLinks) {
        mobileBtn.addEventListener('click', () => {
            // Simple toggle (in a real app, you'd want to add a class and handle CSS)
            if (navLinks.style.display === 'flex') {
                navLinks.style.display = 'none';
            } else {
                navLinks.style.display = 'flex';
                navLinks.style.flexDirection = 'column';
                navLinks.style.position = 'absolute';
                navLinks.style.top = '70px';
                navLinks.style.left = '0';
                navLinks.style.width = '100%';
                navLinks.style.background = 'white';
                navLinks.style.padding = '20px';
                navLinks.style.boxShadow = '0 10px 20px rgba(0,0,0,0.1)';
            }
        });
    }

    // Smooth Scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                
                // Close mobile menu if open
                if (window.innerWidth <= 768 && navLinks) {
                    navLinks.style.display = 'none';
                }

                window.scrollTo({
                    top: targetElement.offsetTop - 70, // Adjust for fixed navbar
                    behavior: 'smooth'
                });
            }
        });
    });

    // Simple mockup animation
    const mockupItems = document.querySelectorAll('.mockup-item');
    if (mockupItems.length > 0) {
        mockupItems.forEach((item, index) => {
            item.style.opacity = '0';
            item.style.transform = 'translateY(10px)';
            item.style.transition = 'all 0.5s ease';
            
            setTimeout(() => {
                item.style.opacity = '1';
                item.style.transform = 'translateY(0)';
            }, 300 + (index * 200));
        });
    }

    // Dropdown delay
    const navDropdown = document.querySelector('.nav-dropdown');
    const dropdownMenu = document.querySelector('.dropdown-menu');
    let dropdownTimeout;

    if (navDropdown && dropdownMenu) {
        navDropdown.addEventListener('mouseenter', () => {
            clearTimeout(dropdownTimeout);
            dropdownMenu.classList.add('show');
        });

        navDropdown.addEventListener('mouseleave', () => {
            dropdownTimeout = setTimeout(() => {
                dropdownMenu.classList.remove('show');
            }, 2000); // 2 seconds
        });
    }

    // Sticky Navbar Scroll Effect
    const navbar = document.querySelector('.portal-nav');
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                navbar.classList.add('nav-scrolled');
            } else {
                navbar.classList.remove('nav-scrolled');
            }
        });
    }

    // Voice Search & Form Navigation Functionality
    const voiceSearchBtn = document.getElementById('voice-search-btn');
    const mainSearchInput = document.getElementById('main-search-input');
    const searchBtn = document.querySelector('.btn-search');
    
    // Keyword Matching & Direct Form Opener
    async function processSearchQuery(query) {
        if (!query || query.trim() === '') {
            alert("⚠️ Please enter or speak a civic complaint query.");
            return;
        }

        // Translate Devanagari / Marathi / Hindi text into English
        let englishText = query;
        if (window.JanSetuVoiceAI && window.JanSetuVoiceAI.translateToEnglish) {
            englishText = await window.JanSetuVoiceAI.translateToEnglish(query);
        }

        const lower = (englishText + ' ' + query).toLowerCase();

        // Check if query contains valid civic keywords (English, Marathi & Hindi - Devanagari + Latin/Hinglish)
        const isRoad = lower.includes('road') || lower.includes('pothole') || lower.includes('tar') || lower.includes('traffic') || 
                       lower.includes('rasta') || lower.includes('raste') || lower.includes('khadda') || lower.includes('khadde') || lower.includes('gadda') || lower.includes('gadde') || lower.includes('sadak') || lower.includes('vahatuk') || lower.includes('dambar') || lower.includes('pool') ||
                       /[\u0900-\u097F]/.test(query) && /रस्ता|रस्ते|खड्डा|खड्डे|सड़क|गड्ढा|गड्ढे|सिमेंट|डांबर|ट्रॅफिक|वाहतूक|पूल|ट्रैफिक|जाम/.test(query);

        const isWater = lower.includes('water') || lower.includes('leak') || lower.includes('pipe') || lower.includes('drain') || lower.includes('sewage') ||
                        lower.includes('pani') || lower.includes('paani') || lower.includes('galti') || lower.includes('nal') || lower.includes('gatar') || lower.includes('naali') || lower.includes('drainage') || lower.includes('taki') ||
                        /[\u0900-\u097F]/.test(query) && /पाणी|पानी|गळती|लीकेज|पाईप|नळ|गटार|नाली|ड्रेनेज|सांडपाणी|टाकी|ओवरफ्लो/.test(query);

        const isLight = lower.includes('light') || lower.includes('bulb') || lower.includes('electric') || lower.includes('dark') || 
                        lower.includes('diva') || lower.includes('dive') || lower.includes('batti') || lower.includes('bijli') || lower.includes('vidyut') || lower.includes('andhar') || lower.includes('andhera') || lower.includes('khamba') || lower.includes('wire') ||
                        /[\u0900-\u097F]/.test(query) && /लाइट|दिवा|दिवे|बत्ती|बिजली|विद्युत|अंधार|अंधेरा|वायर|खांब|खाम/.test(query);

        const isGarbage = lower.includes('garbage') || lower.includes('waste') || lower.includes('clean') || lower.includes('trash') || 
                          lower.includes('kachra') || lower.includes('kachara') || lower.includes('ghan') || lower.includes('safai') || lower.includes('kachragadi') || lower.includes('durgandhi') || lower.includes('swachhata') || lower.includes('badboo') ||
                          /[\u0900-\u097F]/.test(query) && /कचरा|घाण|सफाई|कचरागाडी|दुर्गंधी|प्लास्टिक|कचरापेटी|स्वच्छता|बदबू/.test(query);

        const isPark = lower.includes('tree') || lower.includes('park') || lower.includes('green') || lower.includes('aqi') ||
                       lower.includes('jhad') || lower.includes('jhade') || lower.includes('ped') || lower.includes('fandi') || lower.includes('baag') || lower.includes('udyan') || lower.includes('pradushan') ||
                       /[\u0900-\u097F]/.test(query) && /झाड|झाडे|पेड़|फांदी|बाग|उद्यान|हवा|प्रदूषण|झाडी/.test(query);

        if (isRoad || isWater || isLight || isGarbage || isPark) {
            // Save search intent in localStorage and redirect directly to report form
            localStorage.setItem('pendingSearchQuery', englishText);
            alert(`✅ Matching civic category found for: "${englishText}"!\n\nRedirecting directly to the Official Complaint Form...`);
            window.location.href = `report.html?query=${encodeURIComponent(englishText)}`;
        } else {
            // Invalid non-civic query or unrecognized speech
            alert(`⚠️ Invalid civic issue query: "${query}"\n\nPlease try again with valid Marathi, Hindi or English keywords (e.g. रस्ता/Pothole, पाणी/Water Leak, लाइट/Streetlight, कचरा/Garbage).`);
        }
    }

    if (searchBtn && mainSearchInput) {
        searchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            processSearchQuery(mainSearchInput.value);
        });

        mainSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                processSearchQuery(mainSearchInput.value);
            }
        });
    }
    
    if (voiceSearchBtn && mainSearchInput) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.lang = 'hi-IN';
            recognition.interimResults = false;

            voiceSearchBtn.addEventListener('click', () => {
                try {
                    recognition.start();
                    voiceSearchBtn.classList.add('recording');
                    mainSearchInput.placeholder = "Listening... Speak in Marathi, Hindi, or English";
                } catch (e) {
                    console.log("Recognition already started");
                }
            });

            recognition.onresult = async (event) => {
                const rawTranscript = event.results[0][0].transcript;
                voiceSearchBtn.classList.remove('recording');
                mainSearchInput.placeholder = "Translating speech to English...";

                // Convert Marathi/Hindi speech directly to English for search input
                let englishText = rawTranscript;
                if (window.JanSetuVoiceAI && window.JanSetuVoiceAI.translateToEnglish) {
                    englishText = await window.JanSetuVoiceAI.translateToEnglish(rawTranscript);
                }

                mainSearchInput.value = englishText;
                mainSearchInput.placeholder = "Search for services, reports, or information...";
            };

            recognition.onerror = (event) => {
                console.error("Speech recognition error", event.error);
                voiceSearchBtn.classList.remove('recording');
                mainSearchInput.placeholder = "Search for services, reports, or information...";
                alert("Could not recognize voice. Please try again with clear speech.");
            };

            recognition.onend = () => {
                voiceSearchBtn.classList.remove('recording');
                mainSearchInput.placeholder = "Search for services, reports, or information...";
            };
        } else {
            voiceSearchBtn.addEventListener('click', () => {
                alert("Voice search is not supported in this browser. Please use Chrome or Edge.");
            });
        }
    }
});
