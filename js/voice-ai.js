/**
 * JanSetu AI - Multilingual Voice Mic, Fuzzy Translation & Auto-Form Classifier
 *
 * 3-Layer Matching Pipeline:
 *   Layer 1 – Web Speech API in mr-IN / hi-IN mode → Devanagari transcription
 *   Layer 2 – MyMemory Translation API → sentence-level English translation
 *   Layer 3 – Fuzzy Levenshtein matching → handles all pronunciation variants
 *             (khaade / khadde / khadaa / khaDDa all match "pothole")
 */

window.JanSetuVoiceAI = {
    recognition: null,
    isListening: false,

    // ─── COMPREHENSIVE CIVIC KEYWORD DATABASE ─────────────────────────
    // Each category has Devanagari words, Hinglish/Marathiglish variants,
    // common phonetic misspellings, AND English keywords.
    // Fuzzy matching (edit distance ≤ 2) catches the rest.
    CIVIC_KEYWORDS: {
        road: {
            label: 'Infrastructure & Roads',
            devanagari: ['रस्ता','रस्ते','खड्डा','खड्डे','सड़क','गड्ढा','गड्ढे','सिमेंट','डांबर','ट्रॅफिक','वाहतूक','पूल','ट्रैफिक','जाम','फुटपाथ','पुल','रोड','उखडा','तुटलेला','डोंगरी','टोल','हायवे'],
            latin: ['rasta','raste','khadda','khadde','khaada','khaade','khaDDa','khaDDe','khadaa','gadda','gadde','gaaDha','sadak','sarak','road','pothole','tar','traffic','cement','dambar','pool','vahatuk','jam','footpath','highway','toll','pul','ukhadla','tutlela','dongri'],
            english: ['road','pothole','tar','traffic','highway','bridge','cement','footpath','crack','asphalt','pavement','speed breaker','divider']
        },
        water: {
            label: 'Water & Pipeline',
            devanagari: ['पाणी','पानी','गळती','लीकेज','पाईप','नळ','गटार','नाली','ड्रेनेज','सांडपाणी','टाकी','ओवरफ्लो','बोअरवेल','विहीर','नदी','पूर','जलवाहिनी','गटारी','मलवाहिनी'],
            latin: ['paani','pani','panee','paanee','paaani','galti','galati','leakage','pipe','nal','nul','gatar','gataar','naali','nali','drainage','sandpaani','taki','taaki','overflow','borewell','viir','vihir','nadi','pur','jalvahini','malvahini'],
            english: ['water','leak','pipe','drain','sewage','overflow','borewell','flooding','drainage','pipeline','tap','supply','tank']
        },
        light: {
            label: 'Street Lighting & Electricity',
            devanagari: ['लाइट','दिवा','दिवे','बत्ती','बिजली','विद्युत','अंधार','अंधेरा','वायर','खांब','खाम','ट्रान्सफॉर्मर','विजेचा','फ्यूज','शॉर्टसर्किट','एलईडी','बल्ब'],
            latin: ['light','lait','laait','laayt','diva','dive','divaa','batti','bati','bati','bijli','bijali','vidyut','andhar','andhaar','andhera','wire','wayer','khamba','khaamba','khaam','transformer','vijecha','fuse','fuja','shortcircuit','led','bulb'],
            english: ['light','bulb','electric','dark','streetlight','lamp','pole','transformer','fuse','led','voltage','wire','power','outage','blackout']
        },
        garbage: {
            label: 'Sanitation & Waste',
            devanagari: ['कचरा','घाण','सफाई','कचरागाडी','दुर्गंधी','प्लास्टिक','कचरापेटी','स्वच्छता','बदबू','उकिरडा','डंपिंग','मैला','गंदगी','गलिच्छ','कुजलेला'],
            latin: ['kachra','kachara','kachra','ghan','ghaan','safai','safaai','kachragadi','kacharagadi','durgandhi','plastic','kachrapeti','swachhata','swachata','badboo','badbu','ukirda','dumping','maila','gandagi','galichchha','kujlela'],
            english: ['garbage','waste','clean','trash','dump','sanitation','smell','litter','debris','bin','dustbin','sweeper','compost']
        },
        park: {
            label: 'Parks & Environment',
            devanagari: ['झाड','झाडे','पेड़','फांदी','बाग','उद्यान','हवा','प्रदूषण','झाडी','पार्क','बगीचा','वृक्ष','फुलझाड','गार्डन','हरित'],
            latin: ['jhad','jhade','jhaad','jhaade','ped','pedh','fandi','faandi','baag','bagh','udyan','udyaan','hawa','pradooshan','pradushan','park','bagicha','vruksha','garden','harit'],
            english: ['tree','park','green','garden','aqi','environment','pollution','branch','plant','garden','hedge','landscape']
        }
    },

    // ─── LEVENSHTEIN EDIT-DISTANCE (fuzzy matching core) ──────────────
    levenshtein: function(a, b) {
        const an = a.length, bn = b.length;
        if (an === 0) return bn;
        if (bn === 0) return an;
        const matrix = [];
        for (let i = 0; i <= bn; i++) matrix[i] = [i];
        for (let j = 0; j <= an; j++) matrix[0][j] = j;
        for (let i = 1; i <= bn; i++) {
            for (let j = 1; j <= an; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,  // substitution
                        matrix[i][j - 1] + 1,       // insertion
                        matrix[i - 1][j] + 1         // deletion
                    );
                }
            }
        }
        return matrix[bn][an];
    },

    // ─── FUZZY CATEGORY DETECTION ─────────────────────────────────────
    // Scores text against every keyword in every category.
    // Returns the best matching category or null.
    fuzzyDetectCategory: function(text) {
        const words = text.toLowerCase()
            .replace(/[^\w\s\u0900-\u097F]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 1);

        const scores = {};
        let bestCategory = null;
        let bestScore = 0;

        for (const [cat, data] of Object.entries(this.CIVIC_KEYWORDS)) {
            scores[cat] = 0;
            const allKeywords = [...data.latin, ...data.english];

            for (const word of words) {
                // --- Exact Devanagari match ---
                for (const dWord of data.devanagari) {
                    if (word === dWord.toLowerCase() || word.includes(dWord.toLowerCase()) || dWord.toLowerCase().includes(word)) {
                        scores[cat] += 10;  // high-confidence exact Devanagari match
                    }
                }

                // --- Exact Latin/English match ---
                for (const kw of allKeywords) {
                    if (word === kw) {
                        scores[cat] += 10;
                    }
                }

                // --- Fuzzy match (Levenshtein distance ≤ 2) ---
                // This catches khaade/khadde/khadaa/khaDDa etc.
                // Only for words ≥ 5 chars to avoid short-word false positives
                for (const kw of allKeywords) {
                    if (kw.length >= 5 && word.length >= 5) {
                        const dist = this.levenshtein(word, kw);
                        if (dist === 1) {
                            scores[cat] += 7;  // very close match
                        } else if (dist === 2) {
                            scores[cat] += 4;  // approximate match
                        }
                    }
                }

                // --- Substring containment (handles compound words) ---
                for (const kw of allKeywords) {
                    if (kw.length >= 4 && word.length >= 4 && word !== kw) {
                        if (word.includes(kw) || kw.includes(word)) {
                            scores[cat] += 5;
                        }
                    }
                }
            }

            if (scores[cat] > bestScore) {
                bestScore = scores[cat];
                bestCategory = cat;
            }
        }

        // Minimum threshold: require at least score 4 to count as a match
        return bestScore >= 4 ? { category: bestCategory, score: bestScore, label: this.CIVIC_KEYWORDS[bestCategory].label } : null;
    },

    // ─── INITIALIZATION ───────────────────────────────────────────────
    init: function(micBtnId, textareaId, badgeId, translationId, langSelectId) {
        const micBtn = document.getElementById(micBtnId);
        const textarea = document.getElementById(textareaId);
        const badge = document.getElementById(badgeId);
        const translationText = document.getElementById(translationId);

        if (!micBtn || !textarea) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            micBtn.style.opacity = '0.6';
            micBtn.title = 'Voice recognition not supported in this browser. Please use Chrome/Edge.';
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'mr-IN'; // Marathi-first for best Devanagari transcription

        const self = this;

        micBtn.addEventListener('click', () => {
            if (self.isListening) {
                self.stopListening(micBtn);
            } else {
                self.startListening(micBtn, textarea, badge, translationText);
            }
        });
    },

    startListening: function(micBtn, textarea, badge, translationText) {
        if (!this.recognition) return;

        try {
            this.recognition.lang = 'mr-IN'; // Marathi-first (also handles Hindi Devanagari well)
            this.recognition.start();
            this.isListening = true;

            micBtn.style.background = '#dc2626';
            micBtn.innerHTML = '<i class="fas fa-stop-circle" style="animation: pulse 1s infinite;"></i> 🔴 Listening... Speak now';
        } catch (e) {
            console.warn("Speech recognition error:", e);
        }

        const self = this;

        this.recognition.onresult = function(event) {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }

            textarea.value = transcript;

            if (event.results[0].isFinal) {
                self.stopListening(micBtn);
                self.processTranslationAndAutoForm(transcript, badge, translationText);
            }
        };

        this.recognition.onerror = function(event) {
            console.warn("Speech recognition error event:", event.error);
            self.stopListening(micBtn);
        };

        this.recognition.onend = function() {
            if (self.isListening) {
                self.stopListening(micBtn);
            }
        };
    },

    stopListening: function(micBtn) {
        this.isListening = false;
        if (this.recognition) {
            try { this.recognition.stop(); } catch(e) {}
        }
        if (micBtn) {
            micBtn.style.background = '#2563eb';
            micBtn.innerHTML = '<i class="fas fa-microphone"></i> <span>Speak (Marathi/Hindi/English)</span>';
        }
    },

    processTranslationAndAutoForm: async function(text, badge, translationText) {
        if (!text || text.trim() === '') return;

        // 1. Translate to English (MyMemory API → dictionary fallback)
        const englishTranslation = await this.translateToEnglish(text);

        // 2. Fuzzy-detect category from BOTH original + translated text
        const fuzzyResult = this.fuzzyDetectCategory(englishTranslation + ' ' + text);

        // 3. Generate solution using fuzzy result
        const aiSolution = this.generateAISolution(englishTranslation, text, fuzzyResult);

        if (badge && translationText) {
            badge.style.display = 'block';
            badge.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <p style="margin: 0; font-weight: 700; color: #1e40af;"><i class="fas fa-robot" style="color: #2563eb;"></i> JanSetu AI Speech Translation (English):</p>
                    <p style="margin: 3px 0 0 0; font-style: italic; color: #1e3a8a; font-weight: 600;">"${englishTranslation}"</p>
                    <p style="margin: 3px 0 0 0; font-size: 0.78rem; color: #6b7280;">Original speech: "${text}"</p>
                    ${fuzzyResult ? `<p style="margin: 4px 0 0 0; font-size: 0.8rem; color: #059669; font-weight: 600;">🎯 Detected Category: ${fuzzyResult.label} (confidence: ${fuzzyResult.score})</p>` : ''}
                </div>
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px 12px; border-radius: 8px; margin-top: 8px;">
                    <p style="margin: 0 0 4px 0; font-weight: 800; color: #166534; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-lightbulb" style="color: #eab308;"></i> ⚡ Instant AI Recommended Solution & Action Plan:
                    </p>
                    <p style="margin: 0; font-size: 0.88rem; color: #14532d; font-weight: 600; line-height: 1.4;">${aiSolution.plan}</p>
                    <div style="margin-top: 6px; font-size: 0.8rem; font-weight: 700; color: #047857; display: flex; gap: 12px;">
                        <span>🏢 Department: <strong>${aiSolution.dept}</strong></span>
                        <span>⏱️ Est. Resolution: <strong>${aiSolution.eta}</strong></span>
                    </div>
                </div>
            `;
        }

        // Store AI solution globally for form submission
        window.currentAISolution = aiSolution;

        // 4. Auto-Classify form options
        this.autoSelectFormOptions(englishTranslation, text, fuzzyResult);
    },

    generateAISolution: function(englishText, originalText, fuzzyResult) {
        // Use fuzzy result category if available, otherwise fall back to keyword check
        const category = fuzzyResult ? fuzzyResult.category : null;
        const lower = (englishText + ' ' + originalText).toLowerCase();

        if (category === 'road' || lower.includes('road') || lower.includes('pothole') || lower.includes('tar') || lower.includes('traffic') || /खड्डा|गड्ढा|रस्ता/.test(originalText)) {
            return {
                plan: "Reroute traffic around pothole. Dispatch Cold-Mix Asphalt Patching Truck & Municipal Road Maintenance Crew to lay bitumen seal.",
                dept: "NMC Roads & Pothole Maintenance Cell",
                eta: "24 Hours"
            };
        } else if (category === 'water' || lower.includes('water') || lower.includes('leak') || lower.includes('pipe') || lower.includes('drain') || /पाणी|पानी/.test(originalText)) {
            return {
                plan: "Isolate main water valve to halt flooding. Deploy Orange City Water (OCW) Emergency Leakage Repair Team to replace damaged pipeline section.",
                dept: "NMC Water & Sewage Supply Division",
                eta: "12 Hours"
            };
        } else if (category === 'light' || lower.includes('light') || lower.includes('bulb') || lower.includes('electric') || lower.includes('dark') || /लाइट|दिवा|अंधार/.test(originalText)) {
            return {
                plan: "Dispatch Electrical Maintenance Van to test transformer fuse box & replace burnt 120W LED streetlight bulb.",
                dept: "NMC Street Lighting & Electrical Cell",
                eta: "18 Hours"
            };
        } else if (category === 'garbage' || lower.includes('garbage') || lower.includes('waste') || lower.includes('clean') || lower.includes('trash') || /कचरा|घाण/.test(originalText)) {
            return {
                plan: "Schedule Swachh Bharat Sanitation Tipper Vehicle & waste clearance squad for immediate spot cleaning & deodorization.",
                dept: "Swachh Nagpur Waste Management Division",
                eta: "6 Hours"
            };
        } else if (category === 'park') {
            return {
                plan: "Deploy NMC Garden Division arborist team for tree trimming, branch removal & park safety assessment.",
                dept: "NMC Garden & Environment Division",
                eta: "48 Hours"
            };
        }

        return {
            plan: "Issue categorized and dispatched to Zonal Executive Engineer for immediate site inspection, citizen safety setup & quick resolution.",
            dept: "Nagpur Municipal Corporation Central Cell",
            eta: "24 Hours"
        };
    },

    translateToEnglish: async function(text) {
        const isDevanagari = /[\u0900-\u097F]/.test(text);
        if (!isDevanagari) return text; // Already English

        try {
            // Free high-speed MyMemory Translation API (Marathi/Hindi to English)
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=mr|en`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data && data.responseData && data.responseData.translatedText) {
                    const translated = data.responseData.translatedText;
                    // If API returns something useful (not just the input echoed back)
                    if (translated.toLowerCase() !== text.toLowerCase() && translated.trim().length > 0) {
                        return translated;
                    }
                }
            }
        } catch (e) {
            console.warn("Marathi translation fallback, trying Hindi...", e);
        }

        // Try Hindi as second attempt
        try {
            const url2 = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=hi|en`;
            const res2 = await fetch(url2);
            if (res2.ok) {
                const data2 = await res2.json();
                if (data2 && data2.responseData && data2.responseData.translatedText) {
                    const translated2 = data2.responseData.translatedText;
                    if (translated2.toLowerCase() !== text.toLowerCase() && translated2.trim().length > 0) {
                        return translated2;
                    }
                }
            }
        } catch (e2) {
            console.warn("Hindi translation also failed, using fuzzy fallback:", e2);
        }

        // Client-side dictionary fallback
        return this.dictionaryFallbackTranslate(text);
    },

    dictionaryFallbackTranslate: function(text) {
        let t = text;
        const dict = [
            { deba: /रस्ता|रस्ते|खड्डा|खड्डे|सड़क|गड्ढा|गड्ढे|सिमेंट|डांबर|ट्रॅफिक|वाहतूक|पूल|ट्रैफिक|जाम|फुटपाथ|उखडा|तुटलेला/gi, en: 'road pothole infrastructure issue' },
            { deba: /पाणी|पानी|गळती|लीकेज|पाईप|नळ|गटार|नाली|ड्रेनेज|सांडपाणी|टाकी|ओवरफ्लो|बोअरवेल|विहीर|जलवाहिनी|मलवाहिनी/gi, en: 'water pipeline leakage issue' },
            { deba: /लाइट|दिवा|दिवे|बत्ती|बिजली|विद्युत|अंधार|अंधेरा|वायर|खांब|खाम|ट्रान्सफॉर्मर|फ्यूज|शॉर्टसर्किट|बल्ब/gi, en: 'dark streetlight electricity issue' },
            { deba: /कचरा|घाण|सफाई|कचरागाडी|दुर्गंधी|प्लास्टिक|कचरापेटी|स्वच्छता|बदबू|उकिरडा|डंपिंग|मैला|गंदगी/gi, en: 'garbage waste sanitation issue' },
            { deba: /झाड|झाडे|पेड़|फांदी|बाग|उद्यान|हवा|प्रदूषण|झाडी|पार्क|बगीचा|वृक्ष|गार्डन/gi, en: 'tree park environment issue' }
        ];

        dict.forEach(item => {
            if (item.deba.test(t)) {
                t = t.replace(item.deba, item.en);
            }
        });

        return t;
    },

    autoSelectFormOptions: function(englishText, originalText, fuzzyResult) {
        const category = fuzzyResult ? fuzzyResult.category : null;
        const lower = (englishText + ' ' + originalText).toLowerCase();

        // Check category dropdowns in services.html, explore.html, or report.html
        const categorySelect = document.getElementById('category-select') || document.getElementById('issue-category') || document.getElementById('exp-category');
        const prioritySelect = document.getElementById('priority-select') || document.getElementById('issue-priority');

        if (categorySelect) {
            if (category === 'road' || lower.includes('road') || lower.includes('pothole') || lower.includes('tar') || lower.includes('traffic')) {
                categorySelect.value = categorySelect.options[0] ? categorySelect.options[0].value : 'Infrastructure & Roads';
            } else if (category === 'water' || lower.includes('water') || lower.includes('leak') || lower.includes('pipe') || lower.includes('drain')) {
                categorySelect.value = categorySelect.options[2] ? categorySelect.options[2].value : 'Water & Electricity';
            } else if (category === 'light' || lower.includes('light') || lower.includes('bulb') || lower.includes('electric') || lower.includes('dark')) {
                categorySelect.value = categorySelect.options[2] ? categorySelect.options[2].value : 'Water & Electricity';
            } else if (category === 'garbage' || lower.includes('garbage') || lower.includes('waste') || lower.includes('clean') || lower.includes('trash')) {
                categorySelect.value = categorySelect.options[1] ? categorySelect.options[1].value : 'Sanitation & Waste';
            } else if (category === 'park') {
                // Find parks option or use last option
                for (let i = 0; i < categorySelect.options.length; i++) {
                    if (categorySelect.options[i].value.toLowerCase().includes('park') || categorySelect.options[i].text.toLowerCase().includes('park')) {
                        categorySelect.value = categorySelect.options[i].value;
                        break;
                    }
                }
            }
        }

        if (prioritySelect) {
            if (lower.includes('urgent') || lower.includes('danger') || lower.includes('accident') || lower.includes('emergency') || /खूप|मोठा|तातडी|जरूरी|इमर्जन्सी/.test(originalText)) {
                prioritySelect.value = 'HIGH';
            }
        }
    }
};
