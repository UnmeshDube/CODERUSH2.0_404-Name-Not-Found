document.addEventListener('DOMContentLoaded', () => {
    const adminPortalSection = document.getElementById('admin-portal');
    const adminFeedContainer = document.getElementById('admin-feed-container');
    const totalReportsElement = document.getElementById('total-reports');
    const newReportsElement = document.getElementById('new-reports');
    const adminLogoutBtn = document.getElementById('admin-logout-btn');
    
    // Check if admin is logged in
    function checkAdminAuth() {
        const isAdmin = localStorage.getItem('isAdminLoggedIn') === 'true';
        if (adminPortalSection) {
            if (isAdmin || window.location.hash === '#admin-portal') {
                adminPortalSection.style.display = 'block';
            } else {
                adminPortalSection.style.display = 'none';
            }
        }
    }

    checkAdminAuth();

    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', () => {
            localStorage.removeItem('isAdminLoggedIn');
            localStorage.removeItem('userType');
            alert('Admin logged out successfully.');
            if (adminPortalSection) {
                adminPortalSection.style.display = 'none';
            }
            window.location.hash = '';
        });
    }

    const adminClearDataBtn = document.getElementById('admin-clear-data-btn');
    if (adminClearDataBtn) {
        adminClearDataBtn.addEventListener('click', async () => {
            const confirmDelete = confirm("⚠️ Are you sure you want to delete ALL complaints from the central database?\n\nThis will clear all active reports and reset stats to 0.");
            if (confirmDelete) {
                try {
                    const res = await fetch('/api/reports/clear-all', { method: 'POST' });
                    if (res.ok) {
                        localStorage.removeItem('civic_reports');
                        alert("✅ All complaint data deleted successfully!");
                        lastKnownCount = -1;
                        renderFeed();
                    } else {
                        alert("Failed to clear database on server.");
                    }
                } catch (e) {
                    localStorage.removeItem('civic_reports');
                    alert("✅ Local complaint cache cleared!");
                    lastKnownCount = -1;
                    renderFeed();
                }
            }
        });
    }

    if (!adminFeedContainer) return;

    let lastKnownCount = -1;
    let unsubscribeReports = null;

    function normalizeReportsSnapshot(snapshot) {
        const reports = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            reports.push({
                id: data.id || doc.id,
                ...data,
                timestamp: data.timestamp || (data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString())
            });
        });
        return reports;
    }

    function renderReports(reports) {
        try {
            localStorage.setItem('civic_reports', JSON.stringify(reports));
        } catch (e) {
            console.warn('Unable to cache reports locally', e);
        }

        // Only re-render if count changes to save DOM updates
        if (reports.length === lastKnownCount) return;
        lastKnownCount = reports.length;

        // Update stats
        totalReportsElement.innerText = reports.length;
        
        const today = new Date().toDateString();
        const newToday = reports.filter(r => new Date(r.timestamp).toDateString() === today).length;
        newReportsElement.innerText = newToday;

        if (reports.length === 0) {
            adminFeedContainer.innerHTML = `
                <div class="empty-feed" style="text-align: center; color: var(--text-muted); padding: 40px 0;">
                    <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.5;"></i>
                    <p>Waiting for new reports to come in...</p>
                </div>`;
            return;
        }

        let html = '';
        reports.forEach(report => {
            const timeAgo = new Date(report.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const dateStr = new Date(report.timestamp).toLocaleDateString();
            const currentStatus = report.status || 'Pending';
            
            html += `
            <div class="feed-item" style="display: flex; gap: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 15px;">
                <div class="feed-photo" style="width: 90px; height: 90px; border-radius: 8px; overflow: hidden; flex-shrink: 0; background: #cbd5e1;">
                    <img src="${report.photo}" alt="Report Photo" style="width: 100%; height: 100%; object-fit: cover;">
                </div>
                <div class="feed-content" style="flex-grow: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px;">
                        <h4 style="margin: 0; color: var(--navy); font-size: 1rem;">ID: ${report.id}</h4>
                        <span style="font-size: 0.8rem; color: var(--text-muted);">${dateStr} at ${timeAgo}</span>
                    </div>
                    <p style="margin: 0 0 5px 0; font-size: 0.9rem; font-weight: 600; color: var(--teal);"><i class="fas fa-map-marker-alt"></i> ${report.address}</p>
                    <p style="margin: 0; font-size: 0.9rem; color: var(--text-main);">${report.description || 'No description provided.'}</p>
                    ${report.video ? `<p style="margin: 8px 0 0 0; font-size: 0.85rem;"><a href="${report.video}" target="_blank" rel="noopener" style="color: var(--saffron); font-weight: 600;"><i class="fas fa-video"></i> View video evidence</a></p>` : ''}
                    
                    <!-- JanSetu AI Recommended Action Plan -->
                    <div style="margin-top: 10px; padding: 8px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 0.85rem;">
                        <p style="margin: 0 0 2px 0; font-weight: 700; color: #166534; font-size: 0.82rem;"><i class="fas fa-lightbulb" style="color: #eab308;"></i> JanSetu AI Action Plan Solution:</p>
                        <p style="margin: 0; color: #14532d; font-weight: 600;">${report.aiSolution ? report.aiSolution.plan : 'Route to Municipal Zonal Engineer for site inspection & cold-mix restoration.'}</p>
                    </div>
                    
                    <!-- Admin Status Action Controls -->
                    <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #cbd5e1; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; background: #f8fafc; padding: 10px; border-radius: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 0.85rem; font-weight: 700; color: var(--navy);"><i class="fas fa-tasks"></i> Update Status:</span>
                            <select onchange="updateReportStatus('${report.id}', this.value)" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-weight: 700; font-size: 0.85rem; background: white; cursor: pointer;">
                                <option value="Pending" ${currentStatus === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
                                <option value="In Progress" ${currentStatus === 'In Progress' ? 'selected' : ''}>🛠️ In Progress</option>
                                <option value="Completed" ${currentStatus === 'Completed' || currentStatus === 'Resolved' ? 'selected' : ''}>✅ Completed / Resolved</option>
                            </select>
                        </div>
                        <div style="font-size: 0.82rem; color: var(--text-muted); font-weight: 600;">
                            <i class="fas fa-phone-alt" style="color: var(--teal);"></i> Reporter Phone: <strong style="color: var(--navy);">${report.phone || '9876543210'}</strong>
                        </div>
                    </div>
                </div>
            </div>`;
        });

        adminFeedContainer.innerHTML = html;
    }

    window.updateReportStatus = async function(id, newStatus) {
        try {
            const res = await fetch('/api/reports/update-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status: newStatus })
            });
            if (res.ok) {
                alert(`✅ Complaint #${id} updated to "${newStatus}"!\nSimulated SMS & WhatsApp push notifications are being sent to the citizen...`);
                
                // Lookup report details to send personalized SMS/WhatsApp alert
                try {
                    const cached = JSON.parse(localStorage.getItem('civic_reports') || '[]');
                    const report = cached.find(r => r.id === id);
                    if (report && window.JanSetuSMS && window.JanSetuSMS.triggerStatusUpdate) {
                        const eta = report.aiSolution ? report.aiSolution.eta : '12 Hours';
                        let cat = 'Infrastructure & Roads';
                        if (report.address.includes('(')) {
                            cat = report.address.split('(')[1].split(')')[0];
                        }
                        window.JanSetuSMS.triggerStatusUpdate(report.phone || '9876543210', id, cat, newStatus, eta);
                    }
                } catch (err) {
                    console.warn("SMS status trigger error", err);
                }

                lastKnownCount = -1; // force re-render
                renderFeed();
            }
        } catch (e) {
            alert("Failed to update status on backend.");
        }
    };

    async function renderFeed() {
        let reports = [];
        try {
            const res = await fetch('/api/reports');
            if (res.ok) {
                reports = await res.json();
            } else {
                reports = JSON.parse(localStorage.getItem('civic_reports') || '[]');
            }
        } catch (e) {
            reports = JSON.parse(localStorage.getItem('civic_reports') || '[]');
        }

        renderReports(reports);
    }

    // Always poll central REST API (/api/reports) every 1.5 seconds for instant live real-time sync across mobile & desktop
    renderFeed();
    setInterval(renderFeed, 1500);
});
