import { chromium } from 'playwright';
import fetch from 'node-fetch';
import fs from 'fs';

// --- CONFIGURATION TARGETS ---
const WEBHOOK_URL = process.env.WEBHOOK_URL; 
const ROLE_ID = "<@&1531464694869786675>"; // 🔴 REPLACE THIS WITH YOUR REAL DISCORD ROLE ID IN QUOTES
const TARGET_SITE = "https://workers.dev";
const DB_FILE = './tracked_items.json';

let trackedItems = [];
if (fs.existsSync(DB_FILE)) {
    try { 
        trackedItems = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); 
    } catch (e) { 
        trackedItems = []; 
    }
} else {
    fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
}

async function runTracker() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        console.log(`Launching secure browser context to view: ${TARGET_SITE}`);
        
        // Open the target site and let the client-side JavaScript execute naturally
        await page.goto(TARGET_SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Extract the hidden Next.js text data directly out of the browser's live window
        const rawJsonText = await page.evaluate(() => {
            const dataElement = document.getElementById('__NEXT_DATA__');
            return dataElement ? dataElement.textContent.trim() : null;
        });

        if (!rawJsonText) {
            console.log("Extraction failure: __NEXT_DATA__ marker was missing inside the page DOM framework.");
            await browser.close();
            return;
        }

        // Cleanly read individual item entries via string mapping
        let itemsFound = [];
        const namePattern = /"name"\s*:\s*"([^"]+)"/g;
        let match;
        while ((match = namePattern.exec(rawJsonText)) !== null) {
            const foundName = match[1];
            if (!/^(index|main|app|page|_error|ugcleaks)$/i.test(foundName) && foundName.length > 2) {
                itemsFound.push(foundName.trim());
            }
        }
        itemsFound = [...new Set(itemsFound)];

        console.log(`Scan complete. Verified items located on page: ${itemsFound.length}`);

        let stateModified = false;
        for (const itemName of itemsFound) {
            if (!trackedItems.includes(itemName)) {
                console.log(`[ALERT DISPATCHED]: ${itemName}`);
                trackedItems.push(itemName);
                stateModified = true;
                await sendDiscordAlert(itemName);
            }
        }

        if (stateModified) {
            fs.writeFileSync(DB_FILE, JSON.stringify(trackedItems, null, 2));
        }

    } catch (err) {
        console.error("Browser pipeline execution dropped:", err.message);
    } finally {
        await browser.close();
    }
}

async function sendDiscordAlert(itemName) {
    if (!WEBHOOK_URL) {
        console.error("Missing credentials: process.env.WEBHOOK_URL secret vault value is undefined.");
        return;
    }

    const payload = {
        content: `🚨 <@&${ROLE_ID}> **NEW UGC LEAK PIPELINE DETECTED!**`,
        embeds: [{
            title: `🛍️ Item Tracked: ${itemName}`,
            url: TARGET_SITE,
            color: 16711900,
            timestamp: new Date().toISOString()
        }]
    };
    try {
        await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) { 
        console.error("Webhook frame processing pipeline failure:", err); 
    }
}

runTracker();
              
