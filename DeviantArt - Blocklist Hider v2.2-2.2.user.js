// ==UserScript==
// @name         DeviantArt - Blocklist Hider v2.4
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  Hides deviations from artists in blocklist (URLs/usernames) AND usernames containing specific keywords. Collapses space. Processes immediately on change detection.
// @author       nekohacker591
// @match        *://*.deviantart.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIGURATION ---
    const blocklistUrl = 'https://raw.githubusercontent.com/nekohacker591/deviantnotartblacklist/main/blacklist.txt'; // Use the correct RAW url

    // *** Wildcard Keywords to Block (case-insensitive) ***
    const wildcardBlockKeywords = [
        'photography',
        'stock',
        '3d',
        'model',
        'nature',
        'ero',
        'nude',
        'onlyfans',
        'of',
        'promo',
        'porn',
        'blender',
        'studio',
        'graphy',
        'imagery',
        'subscribe',
        'photo'



        // Add more keywords as strings in this array if needed
    ].map(keyword => keyword.toLowerCase());
    // --- END CONFIGURATION ---

    // --- Sanity Check ---
    const expectedRawUrlPattern = /^https:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/[^\/]+\/.+\.txt$/;
    if (blocklistUrl === 'PUT_YOUR_GITHUB_RAW_FILE_URL_HERE' || blocklistUrl === '') {
        console.error("DA Blocklist Hider: FATAL - Update the script with your GitHub blocklist URL!");
        alert("DA Blocklist Hider: You MUST set the blocklist URL in the script.");
        return;
    }
    if (!expectedRawUrlPattern.test(blocklistUrl)) {
         console.warn("DA Blocklist Hider: WARNING - The blocklist URL might be incorrect: ", blocklistUrl);
    }
    // --- End Sanity Check ---

    let blockedArtists = new Set();
    let hideStyleAdded = false;

    function addHideStyles() {
        if (hideStyleAdded) return;
        GM_addStyle(`
            .da-blocked-deviation-container {
                 display: none !important;
                 height: 0 !important;
                 width: 0 !important;
                 margin: 0 !important;
                 padding: 0 !important;
                 border: none !important;
                 font-size: 0 !important;
                 overflow: hidden !important;
                 visibility: hidden !important;
                 float: none !important;
                 position: static !important;
            }
        `);
        hideStyleAdded = true;
        console.log("DA Blocklist Hider: Added CSS styles for hiding.");
    }

    function fetchBlocklist() {
        console.log("DA Blocklist Hider: Fetching blocklist from", blocklistUrl);
        GM_xmlhttpRequest({
            method: 'GET',
            url: blocklistUrl,
            nocache: true,
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            onload: function(response) {
                if (response.status >= 200 && response.status < 300) {
                    console.log("DA Blocklist Hider: Blocklist fetched successfully.");
                    const text = response.responseText;
                    const lines = text.split(/[\r\n]+/)
                                      .map(line => line.trim())
                                      .filter(line => line.length > 0 && !line.startsWith('#'));

                    const usernames = new Set();
                    const urlPattern = /^https?:\/\/(?:www\.)?deviantart\.com\/([a-zA-Z0-9_-]+)\/?$/i;

                    lines.forEach(line => {
                        const match = line.match(urlPattern);
                        if (match && match[1]) {
                            usernames.add(match[1].toLowerCase());
                        } else if (line.length > 0 && !line.includes('/') && !line.includes('.')) {
                            usernames.add(line.toLowerCase());
                        } else {
                             console.warn(`DA Blocklist Hider: Skipping potentially invalid line in blocklist: "${line}"`);
                        }
                    });

                    blockedArtists = usernames;
                    console.log(`DA Blocklist Hider: Processed ${blockedArtists.size} artists from the explicit blocklist.`);
                    if (blockedArtists.size > 0) {
                         console.log("Blocked artists (first 10):", Array.from(blockedArtists).slice(0, 10).join(', ') + (blockedArtists.size > 10 ? '...' : ''));
                    }
                    if (blockedArtists.size === 0) {
                        console.warn("DA Blocklist Hider: Explicit blocklist resulted in zero valid usernames!");
                    }
                    console.log(`DA Blocklist Hider: Added ${wildcardBlockKeywords.length} wildcard keywords: [${wildcardBlockKeywords.join(', ')}]`);

                    addHideStyles();
                    // Run initial processing slightly delayed to allow page initial render
                    setTimeout(processDeviations, 250);
                    observeMutations(); // Start watching for dynamic content
                } else {
                    console.error(`DA Blocklist Hider: Failed to fetch blocklist. Status: ${response.status} ${response.statusText}. URL: ${blocklistUrl}`);
                    alert(`DA Blocklist Hider: Could not load blocklist. Status: ${response.status}. Check console (F12) & URL.`);
                }
            },
            onerror: function(response) {
                console.error("DA Blocklist Hider: Network error fetching blocklist.", response);
                alert(`DA Blocklist Hider: Network error fetching blocklist. Check console (F12), network, & URL.`);
            }
        });
    }

    function checkWildcardKeywords(username) {
        if (!username || wildcardBlockKeywords.length === 0) {
            return false;
        }
        return wildcardBlockKeywords.some(keyword => username.includes(keyword));
    }

    function processDeviations() {
        if (blockedArtists.size === 0 && wildcardBlockKeywords.length === 0) return;

        // Select links that haven't been processed yet
        const artistLinks = document.querySelectorAll('a[data-username]:not(.da-processed-link)');
        if (artistLinks.length === 0) return; // Nothing new to process

        // console.log(`DA Blocklist Hider: Processing ${artistLinks.length} new links...`); // Optional: uncomment for verbose logging

        artistLinks.forEach(link => {
            link.classList.add('da-processed-link'); // Mark immediately to prevent reprocessing in rapid calls

            const username = link.dataset.username.toLowerCase();
            const isBlockedByList = blockedArtists.has(username);
            const isBlockedByWildcard = !isBlockedByList && checkWildcardKeywords(username);

            let blockReason = '';
            if (isBlockedByList) {
                blockReason = 'explicit list';
            } else if (isBlockedByWildcard) {
                blockReason = 'wildcard keyword';
            }

            if (blockReason) {
                // --- Find the container to hide ---
                const innerContainer = link.closest('div._3Y0hT._3oBlM');
                const gridItemContainer = innerContainer ? innerContainer.parentElement : null;
                const deviationCardContainer = link.closest('div[data-testid="deviation_card"]');
                const articleContainer = link.closest('article[data-hook="deviation_std"]');
                const cellContainer = link.closest('div[data-hook="deviation_cell"]');
                // Add more potential selectors here if needed

                let containerToHide = null;

                if (gridItemContainer && gridItemContainer.matches('div[style*="display:inline-block"]')) {
                    containerToHide = gridItemContainer;
                } else if (deviationCardContainer) {
                    containerToHide = deviationCardContainer;
                } else if (articleContainer) {
                    containerToHide = articleContainer;
                } else if (cellContainer) {
                    containerToHide = cellContainer;
                } else if (innerContainer) {
                    containerToHide = innerContainer;
                    console.warn(`DA Blocklist Hider: Using fallback inner container for ${username} (Blocked via ${blockReason}).`);
                }
                // --- End Container Finding ---

                if (containerToHide && !containerToHide.classList.contains('da-blocked-deviation-container')) {
                    // console.log(`DA Blocklist Hider: Hiding deviation by ${username} (Reason: ${blockReason})`); // Make logging less noisy maybe
                    containerToHide.classList.add('da-blocked-deviation-container');
                } else if (!containerToHide && !link.closest('.da-blocked-deviation-container')) {
                     // Only log warning if we failed AND it's not already hidden by a parent container check
                    console.warn(`DA Blocklist Hider: Could not find suitable container for blocked artist link: ${username} (Reason: ${blockReason})`, link);
                }
            }
        });
    }

    function observeMutations() {
        const targetNode = document.body;
        const config = { childList: true, subtree: true }; // Watch for nodes being added anywhere in the body

        const callback = function(mutationsList, observer) {
            let potentiallyRelevantChange = false;
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check efficiently if the added node itself or any descendant is an unprocessed link
                            if (node.matches('a[data-username]:not(.da-processed-link)') || node.querySelector('a[data-username]:not(.da-processed-link)')) {
                                potentiallyRelevantChange = true;
                                break;
                            }
                        }
                    }
                }
                if (potentiallyRelevantChange) break;
            }

            // *** CHANGE HERE: Removed debounce timer ***
            // If relevant changes were detected, run processDeviations IMMEDIATELY.
            if (potentiallyRelevantChange) {
                // console.log("DA Blocklist Hider: Detected relevant DOM change, processing immediately."); // Optional: uncomment for debug
                processDeviations();
            }
        };

        const observer = new MutationObserver(callback);
        observer.observe(targetNode, config);
        console.log("DA Blocklist Hider: MutationObserver watching for new content (Immediate Processing Mode).");
    }

    // --- Start ---
    addHideStyles();
    fetchBlocklist();

})();
