/**
 * JanSetu AI - Live SMS & WhatsApp Push Notification Simulator (Winning Hackathon Factor)
 * Simulates real-time telecom SMS & WhatsApp alerts sent to citizens when they file
 * a complaint or when an administrator updates the resolution progress.
 */

window.JanSetuSMS = {
    audioCtx: null,

    // Play a clean, professional synthesizer notification sound (dual-tone chime)
    playChime: function() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            
            if (!this.audioCtx) {
                this.audioCtx = new AudioContext();
            }
            
            const ctx = this.audioCtx;
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            const now = ctx.currentTime;
            
            // First chime tone (high frequency)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(880, now); // A5 note
            gain1.gain.setValueAtTime(0, now);
            gain1.gain.linearRampToValueAtTime(0.15, now + 0.05);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            
            // Second chime tone (rich fifth interval)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1318.51, now + 0.08); // E6 note
            gain2.gain.setValueAtTime(0, now + 0.08);
            gain2.gain.linearRampToValueAtTime(0.12, now + 0.12);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);

            osc1.start(now);
            osc1.stop(now + 0.4);
            osc2.start(now + 0.08);
            osc2.stop(now + 0.5);
        } catch (e) {
            console.warn("AudioContext chime failed:", e);
        }
    },

    // Formats SMS message in Marathi, Hindi, or English based on keywords
    formatMessage: function(type, id, category, status, eta, isWhatsApp = false) {
        const platform = isWhatsApp ? 'WhatsApp' : 'SMS';
        const brand = isWhatsApp ? '🟢 *JanSetu AI* (NMC)' : '💬 *JanSetu AI*';
        
        let statusMr = 'प्रलंबित (Pending)';
        let statusHi = 'लंबित (Pending)';
        if (status === 'In Progress') {
            statusMr = 'प्रगतीपथावर (In Progress)';
            statusHi = 'प्रगति पर (In Progress)';
        } else if (status === 'Completed' || status === 'Resolved') {
            statusMr = 'पूर्ण / सोडवली (Resolved) ✅';
            statusHi = 'सुलझाया गया (Resolved) ✅';
        }

        const messages = {
            submit: {
                mr: `${brand}: नमस्कार! आपली तक्रार यशस्वीरीत्या नोंदवली गेली आहे. आयडी: *${id}*, वर्ग: *${category}*. महानगरपालिका पथक लवकरच कामाला लागेल.`,
                hi: `${brand}: नमस्कार! आपकी शिकायत सफलतापूर्वक दर्ज कर ली गई है। आईडी: *${id}*, श्रेणी: *${category}*। नगर निगम टीम जल्द ही काम शुरू करेगी।`,
                en: `${brand}: Hello! Your civic complaint has been successfully registered. ID: *${id}*, Category: *${category}*. Nagpur Municipal Corporation crew is assigned.`
            },
            update: {
                mr: `${brand}: अपडेट! आपली तक्रार आयडी *${id}* (${category}) ची स्थिती बदलून *${statusMr}* करण्यात आली आहे. अपेक्षित वेळ: *${eta || '१२ तास'}*.`,
                hi: `${brand}: अपडेट! आपकी शिकायत आईडी *${id}* (${category}) की स्थिति बदलकर *${statusHi}* कर दी गई है। अपेक्षित समय: *${eta || '१२ घंटे'}*.`,
                en: `${brand}: Update! Your complaint ID *${id}* (${category}) status is now updated to *${status}*. Est. Resolution: *${eta || '12 Hours'}.`
            }
        };

        const list = messages[type];
        return {
            mr: list.mr,
            hi: list.hi,
            en: list.en
        };
    },

    // Displays the phone push notification popup
    showBanner: function(phone, title, msgObj, isWhatsApp = false) {
        this.playChime();

        // Check if there is an existing container
        let container = document.getElementById('jansetu-sms-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'jansetu-sms-container';
            container.style.position = 'fixed';
            container.style.top = '20px';
            container.style.right = '20px';
            container.style.zIndex = '99999';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.gap = '15px';
            container.style.maxWidth = '380px';
            container.style.width = 'calc(100% - 40px)';
            document.body.appendChild(container);
        }

        const banner = document.createElement('div');
        banner.className = 'jansetu-notification-banner';
        
        // Brand details based on type
        const iconClass = isWhatsApp ? 'fab fa-whatsapp' : 'fas fa-sms';
        const iconBg = isWhatsApp ? '#25d366' : '#2563eb';
        const headerText = isWhatsApp ? 'WhatsApp Alert' : 'SMS Alert';
        const formattedPhone = phone.startsWith('+91') ? phone : '+91 ' + phone;

        // Custom internal markup representing phone alert card
        banner.innerHTML = `
            <div style="background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(12px); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 20px 40px rgba(0,0,0,0.3); padding: 16px; color: white; animation: slideInSMS 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; font-family: 'Inter', sans-serif;">
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; margin-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: ${iconBg}; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; font-size: 0.85rem;"><i class="${iconClass}"></i></span>
                        <strong style="font-size: 0.82rem; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.7);">${headerText}</strong>
                    </div>
                    <span style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">Just now</span>
                </div>
                <div style="font-size: 0.85rem; margin-bottom: 8px;">
                    <span style="color: #fb923c; font-weight: 700;">To: ${formattedPhone}</span>
                </div>
                
                <!-- Toggle Tabs for Languages -->
                <div class="lang-tabs" style="display: flex; gap: 6px; margin-bottom: 10px; background: rgba(255,255,255,0.08); padding: 3px; border-radius: 8px;">
                    <button class="lang-tab-btn active" onclick="this.parentNode.parentNode.querySelector('.msg-content-mr').style.display='block'; this.parentNode.parentNode.querySelector('.msg-content-hi').style.display='none'; this.parentNode.parentNode.querySelector('.msg-content-en').style.display='none'; this.parentNode.querySelectorAll('button').forEach(b=>b.classList.remove('active')); this.classList.add('active');" style="flex: 1; border: none; background: transparent; color: white; padding: 4px 6px; font-size: 0.75rem; font-weight: 700; border-radius: 6px; cursor: pointer; transition: all 0.2s;">मराठी</button>
                    <button class="lang-tab-btn" onclick="this.parentNode.parentNode.querySelector('.msg-content-mr').style.display='none'; this.parentNode.parentNode.querySelector('.msg-content-hi').style.display='block'; this.parentNode.parentNode.querySelector('.msg-content-en').style.display='none'; this.parentNode.querySelectorAll('button').forEach(b=>b.classList.remove('active')); this.classList.add('active');" style="flex: 1; border: none; background: transparent; color: white; padding: 4px 6px; font-size: 0.75rem; font-weight: 700; border-radius: 6px; cursor: pointer; transition: all 0.2s;">हिंदी</button>
                    <button class="lang-tab-btn" onclick="this.parentNode.parentNode.querySelector('.msg-content-mr').style.display='none'; this.parentNode.parentNode.querySelector('.msg-content-hi').style.display='none'; this.parentNode.parentNode.querySelector('.msg-content-en').style.display='block'; this.parentNode.querySelectorAll('button').forEach(b=>b.classList.remove('active')); this.classList.add('active');" style="flex: 1; border: none; background: transparent; color: white; padding: 4px 6px; font-size: 0.75rem; font-weight: 700; border-radius: 6px; cursor: pointer; transition: all 0.2s;">Eng</button>
                </div>

                <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 10px; font-size: 0.85rem; line-height: 1.45; border-left: 3px solid ${isWhatsApp ? '#25d366' : '#fb923c'};">
                    <p class="msg-content-mr" style="margin: 0; display: block;">${msgObj.mr.replace(/\*(.*?)\*/g, '<strong>$1</strong>')}</p>
                    <p class="msg-content-hi" style="margin: 0; display: none;">${msgObj.hi.replace(/\*(.*?)\*/g, '<strong>$1</strong>')}</p>
                    <p class="msg-content-en" style="margin: 0; display: none;">${msgObj.en.replace(/\*(.*?)\*/g, '<strong>$1</strong>')}</p>
                </div>

                <button onclick="this.parentNode.parentNode.style.animation='slideOutSMS 0.3s ease forwards'; setTimeout(()=>this.parentNode.parentNode.remove(), 300)" style="margin-top: 10px; background: transparent; border: none; color: rgba(255,255,255,0.5); font-size: 0.8rem; font-weight: 600; width: 100%; text-align: center; cursor: pointer; padding: 5px 0;">Dismiss Notification</button>
            </div>
            
            <style>
                @keyframes slideInSMS {
                    from { transform: translateX(120%) scale(0.9); opacity: 0; }
                    to { transform: translateX(0) scale(1); opacity: 1; }
                }
                @keyframes slideOutSMS {
                    from { transform: translateX(0) scale(1); opacity: 1; }
                    to { transform: translateX(120%) scale(0.9); opacity: 0; }
                }
                .lang-tab-btn.active {
                    background: rgba(255, 255, 255, 0.15) !important;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
            </style>
        `;

        container.appendChild(banner);

        // Auto remove banner after 8 seconds
        setTimeout(() => {
            if (banner && banner.parentNode) {
                banner.style.animation = 'slideOutSMS 0.3s ease forwards';
                setTimeout(() => {
                    if (banner && banner.parentNode) banner.remove();
                }, 300);
            }
        }, 8000);
    },

    // Trigger SMS + WhatsApp alert for a newly submitted complaint
    triggerNewComplaint: function(phone, id, category) {
        const msgObj = this.formatMessage('submit', id, category);
        // Trigger SMS
        this.showBanner(phone, 'SMS Notification', msgObj, false);
        
        // Trigger WhatsApp 1.5 seconds later for added visual demonstration
        setTimeout(() => {
            const whatsappMsgObj = this.formatMessage('submit', id, category, null, null, true);
            this.showBanner(phone, 'WhatsApp Notification', whatsappMsgObj, true);
        }, 1800);
    },

    // Trigger SMS + WhatsApp alert when status is updated by NMC Admin
    triggerStatusUpdate: function(phone, id, category, status, eta) {
        const msgObj = this.formatMessage('update', id, category, status, eta);
        this.showBanner(phone, 'SMS Notification', msgObj, false);
        
        setTimeout(() => {
            const whatsappMsgObj = this.formatMessage('update', id, category, status, eta, true);
            this.showBanner(phone, 'WhatsApp Notification', whatsappMsgObj, true);
        }, 1800);
    }
};
