// ==UserScript==
// @name         Shopee Financial Tracker
// @namespace    http://tampermonkey.net/
// @version      10
// @description  Track and analyze your Shopee purchases with detailed financial reporting
// @author       Ryu-Sena (IndoTech Community)
// @match        https://shopee.co.id/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      shopee.co.id
// ==/UserScript==

(function () {
    'use strict';

    // Configuration
    const CONFIG = {
        PAGE_LOAD_TIMEOUT: 20000,
        BETWEEN_DELAY: 10000,
        MAX_RETRIES: 2,
        UI_TOGGLE_KEY: 'KeyM',
        THEME_KEY: 'shopee_parser_theme',
        CSV_DELIMITER: ';'
    };

    // Global State
    let isParsing = false;
    let currentEntry = 1;
    let parsedData = [];
    let extractedUrls = new Set();
    let isUIHidden = false;
    let isDarkMode = localStorage.getItem(CONFIG.THEME_KEY) === 'dark';

    // === Inject UI Styles ===
    const style = document.createElement('style');
    style.textContent = `
:root {
    --bg-primary: ${isDarkMode ? '#1a1a1a' : '#ffffff'};
    --bg-secondary: ${isDarkMode ? '#2d2d2d' : '#f9fafb'};
    --text-primary: ${isDarkMode ? '#ffffff' : '#1a1a1a'};
    --text-secondary: ${isDarkMode ? '#9ca3af' : '#6b7280'};
    --border-color: ${isDarkMode ? '#404040' : '#e5e7eb'};
    --hover-bg: ${isDarkMode ? '#404040' : '#e5e7eb'};
    --shadow-color: ${isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)'};
    --accent-color: #ee4d2d;
    --success-color: #22c55e;
    --warning-color: #f59e0b;
    --error-color: #ef4444;
}

#parser-ui {
    position: fixed;
    top: 20px;
    left: 20px;
    z-index: 999999;
    background: var(--bg-primary);
    border-radius: 16px;
    box-shadow: 0 8px 24px var(--shadow-color);
    padding: 24px;
    width: 90vw;
    max-width: 1400px;
    max-height: 90vh;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: var(--text-primary);
    display: ${isUIHidden ? 'none' : 'block'};
    transition: all 0.3s ease;
    backdrop-filter: blur(10px);
    border: 1px solid var(--border-color);
    resize: both;
    cursor: move;
}

.parser-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.parser-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border-color);
    cursor: move;
    user-select: none;
}

.parser-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 8px;
}

.header-controls {
    display: flex;
    gap: 8px;
}

.parser-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 0.875rem;
    border-radius: 8px;
    overflow: hidden;
}

.parser-table th, .parser-table td {
    border: 1px solid var(--border-color);
    padding: 12px 16px;
    text-align: left;
    vertical-align: top;
}

.parser-table th {
    background: var(--bg-secondary);
    font-weight: 600;
    white-space: nowrap;
    position: sticky;
    top: 0;
    z-index: 10;
}

.parser-table tr:nth-child(even) {
    background: var(--bg-secondary);
}

.parser-table tr:hover {
    background: var(--hover-bg);
}

.parser-controls {
    margin-top: 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.parser-textarea {
    width: 100%;
    height: 150px;
    margin-top: 12px;
    padding: 12px 16px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    font-size: 0.875rem;
    resize: vertical;
    font-family: monospace;
    background: var(--bg-primary);
    color: var(--text-primary);
    transition: all 0.2s ease;
}

.parser-textarea:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 2px rgba(238, 77, 45, 0.1);
}

.btn {
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-secondary);
    color: var(--text-primary);
}

.btn:hover {
    transform: translateY(-1px);
    filter: brightness(1.1);
}

.btn:active {
    transform: translateY(0);
}

.btn-green { background: var(--success-color); color: white; }
.btn-red { background: var(--error-color); color: white; }
.btn-blue { background: #3b82f6; color: white; }
.btn-yellow { background: var(--warning-color); color: white; }
.btn-purple { background: #8b5cf6; color: white; }
.btn-gray { background: var(--bg-secondary); color: var(--text-primary); }

.parser-status {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-top: 8px;
    padding: 12px;
    border-radius: 8px;
    background: var(--bg-secondary);
    display: flex;
    align-items: center;
    gap: 8px;
}

.credit {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-align: center;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color);
}

.guide-modal {
    position: fixed;
    top: 10%;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999999;
    background: var(--bg-primary);
    border-radius: 16px;
    box-shadow: 0 8px 24px var(--shadow-color);
    padding: 24px;
    max-width: 80%;
    max-height: 80vh;
    overflow-y: auto;
    display: none;
    flex-direction: column;
    gap: 16px;
    color: var(--text-primary);
    border: 1px solid var(--border-color);
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border-color);
}

.modal-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
}

.modal-content {
    white-space: pre-wrap;
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.6;
}

.modal-close {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s ease;
}

.modal-close:hover {
    background: var(--hover-bg);
}

.theme-toggle {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 999999;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 50%;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 8px var(--shadow-color);
    transition: all 0.3s ease;
}

.theme-toggle:hover {
    transform: scale(1.1);
}

.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 24px;
    border-radius: 8px;
    background: var(--bg-primary);
    color: var(--text-primary);
    box-shadow: 0 4px 12px var(--shadow-color);
    z-index: 9999999;
    transform: translateX(120%);
    transition: transform 0.3s ease;
    border: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    gap: 8px;
}

.notification.show {
    transform: translateX(0);
}

.notification.success { border-left: 4px solid var(--success-color); }
.notification.error { border-left: 4px solid var(--error-color); }
.notification.warning { border-left: 4px solid var(--warning-color); }
.notification.info { border-left: 4px solid #3b82f6; }

.price {
    font-family: monospace;
    font-weight: 500;
}

.price.positive { color: var(--success-color); }
.price.negative { color: var(--error-color); }
.price.total { font-weight: 600; color: var(--accent-color); }

/* Scrollbar Styling */
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: var(--bg-secondary);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
}

.resize-handle {
    position: absolute;
    width: 20px;
    height: 20px;
    bottom: 0;
    right: 0;
    cursor: se-resize;
    z-index: 1000;
}

.resize-handle::after {
    content: '';
    position: absolute;
    right: 4px;
    bottom: 4px;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 0 0 8px 8px;
    border-color: transparent transparent var(--text-secondary) transparent;
}
`;

    document.head.appendChild(style);

    // === UI HTML ===
    const uiHTML = `
        <div id="parser-ui">
            <div class="parser-container">
                <div class="parser-header">
                    <div class="parser-title">
                        <span>📊 Shopee Financial Tracker v10</span>
                    </div>
                    <div class="header-controls">
                        <button class="btn btn-gray" id="guide-btn">📘 Guide</button>
                        <button class="btn btn-gray" id="theme-btn">${isDarkMode ? '☀️' : '🌙'}</button>
                    </div>
                </div>
                <div class="resize-handle"></div>
                <textarea id="url-input" placeholder="Paste 1-3 order links (one per line)" class="parser-textarea"></textarea>
                <div class="parser-controls">
                    <button class="btn btn-green" id="start-btn">▶️ Start</button>
                    <button class="btn btn-red" id="stop-btn" disabled>⏹️ Stop</button>
                    <button class="btn btn-yellow" id="clear-btn">🗑️ Clear</button>
                    <button class="btn btn-gray" id="remove-dupes-btn">🔍 Remove Duplicates</button>
                    <button class="btn btn-blue" id="csv-btn">📊 Export CSV</button>
                    <button class="btn btn-purple" id="md-btn">📝 Export Markdown</button>
                    <button class="btn btn-gray" id="extract-btn">🔗 Extract Order Links</button>
                </div>
                <div class="parser-status" id="status">Ready</div>
                <table class="parser-table" id="results-table">
                    <thead>
                        <tr>
                            <th>Entry</th>
                            <th>Shop</th>
                            <th>Order Date</th>
                            <th>Item</th>
                            <th>Subtotal Produk</th>
                            <th>Subtotal Pengiriman</th>
                            <th>Diskon Pengiriman</th>
                            <th>Voucher Shopee</th>
                            <th>Biaya Layanan</th>
                            <th>Total Pesanan</th>
                            <th>URL</th>
                        </tr>
                    </thead>
                    <tbody id="results-body"></tbody>
                </table>
                <div class="credit">Developed by <a href="https://github.com/tukangcode" target="_blank" style="color: #3b82f6; text-decoration: underline;">Ryu-Sena</a> | IndoTech Community</div>
            </div>
            <div class="guide-modal" id="guide-modal">
                <div class="modal-header">
                    <div class="modal-title">📘 User Guide</div>
                    <button class="modal-close" id="modal-close">✕</button>
                </div>
                <div class="modal-content">📘 How to Use:
1. Enable Popups for Shopee:
   - Chrome: 🔐 (Site Info) > Site Settings > Allow Popups
   - Firefox: ⓘ (Site Info) > Permissions > Allow Popups

2. Extract Order Links:
   - Go to "My Orders" page.
   - Click [🔗 Extract Order Links] to capture visible order URLs.

3. Ensure No Duplicate Links:
   - Click [🔍 Remove Duplicates] to clean up duplicated links.

4. Start Parsing:
   - Click [▶️ Start] to begin extracting order details.
   - Wait patiently; progress will appear in the status.

5. If CAPTCHA Appears:
   - Script will pause for 60 seconds to let you solve CAPTCHA manually.
   - After solving, let tab for 10 seconds and script will continue last progress.
   - Parsing will automatically resume.

6. Export Results:
   - After parsing, export the result via:
     - [📊 Export CSV] for spreadsheet (Excel, etc).
     - [📝 Export Markdown] for clean text format.

7. UI Controls:
   - Press Ctrl+M anytime to toggle the UI visibility.
   - Click 🌙/☀️ to toggle dark/light mode.

ℹ️ Notes:
- Avoid opening more than 3 order links manually to prevent Shopee detection.
- Parsing 200+ orders usually does NOT trigger CAPTCHA but stay alert just in case.
- CSV export uses semicolons (;) for better Excel compatibility.
- Dark mode preference is saved between sessions.
- All prices are formatted with proper currency symbols.
                </div>
                <div class="modal-footer">
                    <button class="modal-close" id="modal-ok">OK</button>
                </div>
            </div>
        </div>
        <div class="theme-toggle" id="theme-toggle">${isDarkMode ? '☀️' : '🌙'}</div>
        <div class="notification" id="notification"></div>
    `;

    const div = document.createElement('div');
    div.innerHTML = uiHTML;
    document.body.appendChild(div);

    // === DOM Elements ===
    const parserUI = document.getElementById('parser-ui');
    const urlInput = document.getElementById('url-input');
    const statusText = document.getElementById('status');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const clearBtn = document.getElementById('clear-btn');
    const csvBtn = document.getElementById('csv-btn');
    const mdBtn = document.getElementById('md-btn');
    const extractBtn = document.getElementById('extract-btn');
    const removeDupesBtn = document.getElementById('remove-dupes-btn');
    const resultsBody = document.getElementById('results-body');
    const guideBtn = document.getElementById('guide-btn');
    const guideModal = document.getElementById('guide-modal');
    const modalClose = document.getElementById('modal-close');
    const modalOk = document.getElementById('modal-ok');
    const themeBtn = document.getElementById('theme-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const notification = document.getElementById('notification');

    // === Helper Functions ===
    function showNotification(message, type = 'info') {
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    function updateStatus(text, type = 'info') {
        statusText.textContent = text;
        statusText.className = `parser-status ${type}`;
    }

    function toggleTheme() {
        isDarkMode = !isDarkMode;
        localStorage.setItem(CONFIG.THEME_KEY, isDarkMode ? 'dark' : 'light');
        document.documentElement.style.setProperty('--bg-primary', isDarkMode ? '#1a1a1a' : '#ffffff');
        document.documentElement.style.setProperty('--bg-secondary', isDarkMode ? '#2d2d2d' : '#f9fafb');
        document.documentElement.style.setProperty('--text-primary', isDarkMode ? '#ffffff' : '#1a1a1a');
        document.documentElement.style.setProperty('--text-secondary', isDarkMode ? '#9ca3af' : '#6b7280');
        document.documentElement.style.setProperty('--border-color', isDarkMode ? '#404040' : '#e5e7eb');
        document.documentElement.style.setProperty('--hover-bg', isDarkMode ? '#404040' : '#e5e7eb');
        document.documentElement.style.setProperty('--shadow-color', isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)');
        themeBtn.textContent = isDarkMode ? '☀️' : '🌙';
        themeToggle.textContent = isDarkMode ? '☀️' : '🌙';
    }

    function extractOrderNumber(url) {
        const pattern = '/user/purchase/order/';
        const startIndex = url.indexOf(pattern);
        if (startIndex === -1) return null;
        const idStart = startIndex + pattern.length;
        const idEnd = url.indexOf('?', idStart);
        const rawId = idEnd !== -1 ? url.substring(idStart, idEnd) : url.substring(idStart);
        return /^\d+$/.test(rawId) ? rawId : null;
    }

    function removeDuplicatesFromInput() {
        const urls = urlInput.value
            .split('\n')
            .map(u => u.trim())
            .filter(Boolean);

        const seen = new Set();
        const uniqueUrls = [];

        for (const url of urls) {
            const orderNumber = extractOrderNumber(url);
            if (orderNumber && !seen.has(orderNumber)) {
                seen.add(orderNumber);
                uniqueUrls.push(url);
            }
        }

        urlInput.value = uniqueUrls.join('\n');
        const removedCount = urls.length - uniqueUrls.length;
        if (removedCount > 0) {
            showNotification(`✅ Removed ${removedCount} duplicate(s)`, 'success');
        } else {
            showNotification('ℹ️ No duplicates found', 'info');
        }
    }

    function extractOrderLinks() {
        const links = Array.from(document.querySelectorAll('a[href^="/user/purchase/order/"]'))
            .map(a => `https://shopee.co.id${a.getAttribute('href')}`);

        const seen = new Set();
        const uniqueLinks = [];

        for (const url of links) {
            const orderNumber = extractOrderNumber(url);
            if (orderNumber && !seen.has(orderNumber)) {
                seen.add(orderNumber);
                uniqueLinks.push(url);
            }
        }

        if (uniqueLinks.length > 0) {
            const existingUrls = urlInput.value
                .split('\n')
                .map(u => u.trim())
                .filter(Boolean);

            urlInput.value = [...existingUrls, ...uniqueLinks].join('\n');
            showNotification(`✅ Found ${uniqueLinks.length} new order links`, 'success');
        } else {
            showNotification('⚠️ No new order links found', 'warning');
        }
    }

    function addResult(result) {
        if (!result || !result.items.length) return;

        result.items.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${result.Entry}</td>
                <td>${result.Shop}</td>
                <td>${result['Order Date']}</td>
                <td>${item.name}</td>
                <td class="price">${item.subtotalProduk || '-'}</td>
                <td class="price">${item.subtotalPengiriman || '-'}</td>
                <td class="price negative">${item.diskonPengiriman || '-'}</td>
                <td class="price negative">${item.voucherShopee || '-'}</td>
                <td class="price">${item.biayaLayanan || '-'}</td>
                <td class="price total">${item.totalPesanan || '-'}</td>
                <td><a href="${result.URL}" target="_blank">${result.URL}</a></td>
            `;
            resultsBody.appendChild(row);
        });

        parsedData.push(result);
    }

    function clearResults() {
        while (resultsBody.firstChild) {
            resultsBody.removeChild(resultsBody.firstChild);
        }
        parsedData = [];
        updateStatus("🧹 Cleared", 'info');
    }

    function exportData(format) {
        if (!parsedData.length) {
            showNotification("⚠️ No data to export!", 'error');
            return;
        }
        if (format === 'csv') {
            exportToCSV(parsedData);
        } else {
            exportToMarkdown(parsedData);
        }
    }

    function exportToCSV(data) {
        const headers = ['Entry','Shop','Order Date','Item','Subtotal Produk','Subtotal Pengiriman','Diskon Pengiriman','Voucher Shopee','Biaya Layanan','Total Pesanan','URL'];
        let csv = headers.join(CONFIG.CSV_DELIMITER) + '\n';
        data.forEach(order => {
            order.items.forEach(item => {
                csv += [
                    order.Entry,
                    order.Shop,
                    order['Order Date'],
                    item.name,
                    item.subtotalProduk || '-',
                    item.subtotalPengiriman || '-',
                    item.diskonPengiriman || '-',
                    item.voucherShopee || '-',
                    item.biayaLayanan || '-',
                    item.totalPesanan || '-',
                    `"${order.URL}"`
                ].join(CONFIG.CSV_DELIMITER) + '\n';
            });
        });
        downloadFile(csv, 'shopee_orders.csv');
        showNotification('✅ CSV exported successfully!', 'success');
    }

    function exportToMarkdown(data) {
        const headers = ['Entry','Shop','Order Date','Item','Subtotal Produk','Subtotal Pengiriman','Diskon Pengiriman','Voucher Shopee','Biaya Layanan','Total Pesanan','URL'];
        let md = '# Shopee Orders\n';
        md += headers.map(h => `**${h}**`).join(' | ') + '\n';
        md += headers.map(() => '---').join(' | ') + '\n';
        data.forEach(order => {
            order.items.forEach(item => {
                md += [
                    order.Entry,
                    order.Shop,
                    order['Order Date'],
                    item.name,
                    item.subtotalProduk || '-',
                    item.subtotalPengiriman || '-',
                    item.diskonPengiriman || '-',
                    item.voucherShopee || '-',
                    item.biayaLayanan || '-',
                    item.totalPesanan || '-',
                    order.URL
                ].join(' | ') + '\n';
            });
        });
        downloadFile(md, 'shopee_orders.md');
        showNotification('✅ Markdown exported successfully!', 'success');
    }

    function downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function cancellableDelay(ms) {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (!isParsing) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);

            const timeout = setTimeout(() => {
                clearInterval(checkInterval);
                resolve();
            }, ms);
        });
    }

    function waitForPageLoad(win) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Page load timeout'));
            }, CONFIG.PAGE_LOAD_TIMEOUT);

            const checkInterval = setInterval(() => {
                if (!isParsing || !win || !win.document) {
                    clearInterval(checkInterval);
                    clearTimeout(timeout);
                    win?.close();
                    reject(new Error('Parsing stopped or window closed'));
                    return;
                }

                if (win.document.readyState === 'complete') {
                    clearInterval(checkInterval);
                    clearTimeout(timeout);
                    resolve();
                }
            }, 1000);
        });
    }

    async function scrapeOrderDetail(url, entryNumber) {
        let retryCount = 0;
        while (retryCount <= CONFIG.MAX_RETRIES && isParsing) {
            const win = window.open(url, '_blank');
            if (!win) {
                showNotification("❌ Popup blocked - Enable popups in browser settings", 'error');
                return null;
            }

            try {
                await waitForPageLoad(win);
                if (!isParsing) {
                    win.close();
                    return null;
                }

                await cancellableDelay(5000);
                const doc = win.document;

                // Get shop name and order date
                const shopName = doc.querySelector('.UDaMW3')?.textContent.trim() || 'NOT FOUND';
                const orderDate = doc.querySelector('.stepper__step-date')?.textContent.trim() || 'NOT FOUND';

                // Helper function to find value by label
                const findValueByLabel = (label) => {
                    const elements = Array.from(doc.querySelectorAll('.kW3VDc'));
                    const element = elements.find(el => 
                        el.querySelector('.Vg5MF2 span')?.textContent.trim() === label
                    );
                    return element?.querySelector('.Tfejtu div')?.textContent.trim() || 'NOT FOUND';
                };

                // Get all order details
                const subtotalProduk = findValueByLabel('Subtotal Produk');
                const subtotalPengiriman = findValueByLabel('Subtotal Pengiriman');
                const diskonPengiriman = findValueByLabel('Subtotal Diskon Pengiriman');
                const voucherShopee = findValueByLabel('Voucher Shopee Digunakan');
                const biayaLayanan = findValueByLabel('Biaya Layanan');
                const totalPesanan = findValueByLabel('Total Pesanan');

                // Debug logging
                console.log('Order Details:', {
                    subtotalProduk,
                    subtotalPengiriman,
                    diskonPengiriman,
                    voucherShopee,
                    biayaLayanan,
                    totalPesanan
                });

                const itemElements = doc.querySelectorAll('a.mZ1OWk');
                const items = [];

                itemElements.forEach(item => {
                    const name = item.querySelector('.DWVWOJ')?.textContent.trim() || 'NOT FOUND';
                    const quantity = item.querySelector('.j3I_Nh')?.textContent.trim() || 'x1';

                    if (name !== 'NOT FOUND') {
                        items.push({
                            name: `${name} ${quantity}`,
                            subtotalProduk,
                            subtotalPengiriman,
                            diskonPengiriman,
                            voucherShopee,
                            biayaLayanan,
                            totalPesanan
                        });
                    }
                });

                win.close();

                if (items.length === 0) {
                    retryCount++;
                    if (retryCount > CONFIG.MAX_RETRIES) return null;
                    updateStatus(`🔁 Retrying #${retryCount}`, 'warning');
                    await cancellableDelay(3000);
                    continue;
                }

                return {
                    Entry: entryNumber,
                    Shop: shopName,
                    'Order Date': orderDate,
                    items,
                    URL: url
                };
            } catch (err) {
                win.close();
                retryCount++;
                if (retryCount > CONFIG.MAX_RETRIES) {
                    showNotification(`❌ Error parsing order: ${err.message}`, 'error');
                    return null;
                }
                updateStatus(`🔁 Retrying #${retryCount}`, 'warning');
                await cancellableDelay(3000);
            }
        }
        return null;
    }

    async function run() {
        isParsing = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        updateStatus('🚀 Starting...', 'info');
        currentEntry = 1;

        const urls = urlInput.value
            .split('\n')
            .map(u => u.trim())
            .filter(u => u.startsWith('https://shopee.co.id'));

        if (!urls.length) {
            showNotification("⚠️ No valid URLs found", 'error');
            resetUI();
            return;
        }

        clearResults();

        for (const url of urls) {
            if (!isParsing) break;
            updateStatus(`Processing #${currentEntry}`, 'info');
            const result = await scrapeOrderDetail(url, currentEntry);
            if (result && isParsing) {
                addResult(result);
                currentEntry++;
                if (urls.indexOf(url) < urls.length - 1) {
                    updateStatus(`⏳ Waiting ${CONFIG.BETWEEN_DELAY / 1000}s`, 'info');
                    await cancellableDelay(CONFIG.BETWEEN_DELAY);
                }
            }
        }

        if (isParsing) {
            updateStatus("✅ All done!", 'success');
            showNotification('✅ Parsing completed successfully!', 'success');
        } else {
            updateStatus("🛑 Stopped", 'warning');
            showNotification('🛑 Parsing stopped by user', 'warning');
        }

        resetUI();
    }

    function resetUI() {
        isParsing = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }

    function toggleUIVisibility() {
        isUIHidden = !isUIHidden;
        parserUI.style.display = isUIHidden ? 'none' : 'block';
        showNotification(`UI ${isUIHidden ? 'hidden' : 'shown'}`, 'info');
    }

    // === Event Listeners ===
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.code === CONFIG.UI_TOGGLE_KEY) {
            e.preventDefault();
            toggleUIVisibility();
        }
    });

    startBtn.addEventListener('click', () => {
        if (!isParsing) run();
    });

    stopBtn.addEventListener('click', () => {
        if (isParsing) {
            isParsing = false;
            updateStatus("🛑 Stopping...", 'warning');
            showNotification('🛑 Stopping parser...', 'warning');
        }
    });

    clearBtn.addEventListener('click', () => {
        if (confirm("Clear all data?")) {
            clearResults();
            showNotification('🧹 Data cleared', 'info');
        }
    });

    csvBtn.addEventListener('click', () => exportData('csv'));
    mdBtn.addEventListener('click', () => exportData('markdown'));
    extractBtn.addEventListener('click', extractOrderLinks);
    removeDupesBtn.addEventListener('click', removeDuplicatesFromInput);

    guideBtn.addEventListener('click', () => {
        guideModal.style.display = 'flex';
    });

    [modalClose, modalOk].forEach(btn => {
        btn.addEventListener('click', () => {
            guideModal.style.display = 'none';
        });
    });

    [themeBtn, themeToggle].forEach(btn => {
        btn.addEventListener('click', () => {
            toggleTheme();
            showNotification(`Switched to ${isDarkMode ? 'dark' : 'light'} mode`, 'info');
        });
    });

    // === Initialize ===
    window.addEventListener('load', () => {
        updateStatus("Ready", 'info');
        showNotification('Parser initialized successfully!', 'success');
        makeDraggable(parserUI);
    });

    function makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const header = element.querySelector('.parser-header');
        
        header.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();
            // get the mouse cursor position at startup
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            // call a function whenever the cursor moves
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            // calculate the new cursor position
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            // set the element's new position
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            // stop moving when mouse button is released
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

})();
