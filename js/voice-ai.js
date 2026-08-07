/**
 * JanSetu AI - Multilingual Voice Mic, Translation & Auto-Form Classifier
 * Converts speech in Marathi (मराठी), Hindi (हिंदी), or English into English for AI decision making,
 * and automatically classifies form requirements.
 */

window.JanSetuVoiceAI = {
    recognition: null,
    isListening: false,

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
        this.recognition.lang = 'hi-IN'; // Default to Hindi/Marathi Devanagari recognition

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
            // Auto detect or select Marathi / Hindi / English
            this.recognition.lang = 'hi-IN';
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

        // 1. Translate Marathi/Hindi Devanagari to English for AI Decision Engine
        const englishTranslation = await this.translateToEnglish(text);

        // 2. Generate Instant AI Municipal Solution & Action Plan
        const aiSolution = this.generateAISolution(englishTranslation, text);

        if (badge && translationText) {
            badge.style.display = 'block';
            badge.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <p style="margin: 0; font-weight: 700; color: #1e40af;"><i class="fas fa-robot" style="color: #2563eb;"></i> JanSetu AI Speech Translation (English):</p>
                    <p style="margin: 3px 0 0 0; font-style: italic; color: #1e3a8a; font-weight: 600;">"${englishTranslation}"</p>
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

        // Store AI solution globally on window for form submission attachment
        window.currentAISolution = aiSolution;

        // 3. Auto-Classify and Select Form Options based on translated text
        this.autoSelectFormOptions(englishTranslation, text);
    },

    generateAISolution: function(englishText, originalText) {
        const lower = (englishText + ' ' + originalText).toLowerCase();

        if (lower.includes('road') || lower.includes('pothole') || lower.includes('tar') || lower.includes('traffic') || lower.includes('खड्डा') || lower.includes('गड्ढा') || lower.includes('रस्ता')) {
            return {
                plan: "Reroute traffic around pothole. Dispatch Cold-Mix Asphalt Patching Truck & Municipal Road Maintenance Crew to lay bitumen seal.",
                dept: "NMC Roads & Pothole Maintenance Cell",
                eta: "24 Hours"
            };
        } else if (lower.includes('water') || lower.includes('leak') || lower.includes('pipe') || lower.includes('drain') || lower.includes('पाणी') || lower.includes('पानी')) {
            return {
                plan: "Isolate main water valve to halt flooding. Deploy Orange City Water (OCW) Emergency Leakage Repair Team to replace damaged pipeline section.",
                dept: "NMC Water & Sewage Supply Division",
                eta: "12 Hours"
            };
        } else if (lower.includes('light') || lower.includes('bulb') || lower.includes('electric') || lower.includes('dark') || lower.includes('लाइट') || lower.includes('दिवा') || lower.includes('अंधार')) {
            return {
                plan: "Dispatch Electrical Maintenance Van to test transformer fuse box & replace burnt 120W LED streetlight bulb.",
                dept: "NMC Street Lighting & Electrical Cell",
                eta: "18 Hours"
            };
        } else if (lower.includes('garbage') || lower.includes('waste') || lower.includes('clean') || lower.includes('trash') || lower.includes('कचरा') || lower.includes('घाण')) {
            return {
                plan: "Schedule Swachh Bharat Sanitation Tipper Vehicle & waste clearance squad for immediate spot cleaning & deodorization.",
                dept: "Swachh Nagpur Waste Management Division",
                eta: "6 Hours"
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
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|en`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data && data.responseData && data.responseData.translatedText) {
                    return data.responseData.translatedText;
                }
            }
        } catch (e) {
            console.warn("Translation API fallback used:", e);
        }

        // Client-side Dictionary Fallback mapping
        return this.dictionaryFallbackTranslate(text);
    },

    dictionaryFallbackTranslate: function(text) {
        let t = text;
        const dict = [
            { deba: /रस्ता|रस्ते|खड्डा|खड्डे|सड़क|गड्ढा|गड्ढे|सिमेंट|डांबर|ट्रॅफिक|वाहतूक|पूल|ट्रैफिक|जाम/gi, en: 'road pothole infrastructure issue' },
            { deba: /पाणी|पानी|गळती|लीकेज|पाईप|नळ|गटार|नाली|ड्रेनेज|सांडपाणी|टाकी|ओवरफ्लो/gi, en: 'water pipeline leakage issue' },
            { deba: /लाइट|दिवा|दिवे|बत्ती|बिजली|विद्युत|अंधार|अंधेरा|वायर|खांब|खाम/gi, en: 'dark streetlight electricity issue' },
            { deba: /कचरा|घाण|सफाई|कचरागाडी|दुर्गंधी|प्लास्टिक|कचरापेटी|स्वच्छता|बदबू/gi, en: 'garbage waste sanitation issue' },
            { deba: /झाड|झाडे|पेड़|फांदी|बाग|उद्यान|हवा|प्रदूषण|झाडी/gi, en: 'tree park environment issue' }
        ];

        dict.forEach(item => {
            if (item.deba.test(t)) {
                t = t.replace(item.deba, item.en);
            }
        });

        return t;
    },

    autoSelectFormOptions: function(englishText, originalText) {
        const lower = (englishText + ' ' + originalText).toLowerCase();

        // Check category dropdowns in services.html, explore.html, or report.html if present
        const categorySelect = document.getElementById('category-select') || document.getElementById('issue-category') || document.getElementById('exp-category');
        const prioritySelect = document.getElementById('priority-select') || document.getElementById('issue-priority');

        if (categorySelect) {
            if (lower.includes('road') || lower.includes('pothole') || lower.includes('tar') || lower.includes('traffic')) {
                categorySelect.value = categorySelect.options[0] ? categorySelect.options[0].value : 'Infrastructure & Roads';
            } else if (lower.includes('water') || lower.includes('leak') || lower.includes('pipe') || lower.includes('drain')) {
                categorySelect.value = categorySelect.options[2] ? categorySelect.options[2].value : 'Water & Electricity';
            } else if (lower.includes('light') || lower.includes('bulb') || lower.includes('electric') || lower.includes('dark')) {
                categorySelect.value = categorySelect.options[2] ? categorySelect.options[2].value : 'Water & Electricity';
            } else if (lower.includes('garbage') || lower.includes('waste') || lower.includes('clean') || lower.includes('trash')) {
                categorySelect.value = categorySelect.options[1] ? categorySelect.options[1].value : 'Sanitation & Waste';
            }
        }

        if (prioritySelect) {
            if (lower.includes('urgent') || lower.includes('danger') || lower.includes('accident') || lower.includes('emergency') || lower.includes('खूप') || lower.includes('मोठा')) {
                prioritySelect.value = 'HIGH';
            }
        }
    }
};
