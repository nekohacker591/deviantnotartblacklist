// ==UserScript==
// @name         DeviantArt - Blocklist Hider v2.2
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Hides deviations from artists in blocklist (URLs/usernames). Collapses space.
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

    // *** UPDATED HIDE STYLES FUNCTION ***
    function addHideStyles() {
        if (hideStyleAdded) return;
        GM_addStyle(`
            .da-blocked-deviation-container {
                 /* The nuclear option: Remove element completely from layout */
                 display: none !important;

                 /* These might be redundant with display:none, but can't hurt */
                 height: 0 !important;
                 width: 0 !important;
                 margin: 0 !important;
                 padding: 0 !important;
                 border: none !important; /* Explicitly remove borders */
                 font-size: 0 !important;
                 overflow: hidden !important;
                 visibility: hidden !important; /* Keep this for belt-and-suspenders */
                 float: none !important;
                 position: static !important;
            }
        `);
        hideStyleAdded = true;
        console.log("DA Blocklist Hider: Added CSS styles for hiding (using display:none).");
    }
    // *** END OF UPDATED FUNCTION ***

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
                            const extractedUsername = match[1].toLowerCase();
                            usernames.add(extractedUsername);
                        } else if (line.length > 0 && !line.includes('/') && !line.includes('.')) {
                            const plainUsername = line.toLowerCase();
                            usernames.add(plainUsername);
                        } else {
                             console.warn(`DA Blocklist Hider: Skipping potentially invalid line in blocklist: "${line}"`);
                        }
                    });

                    blockedArtists = usernames;
                    console.log(`DA Blocklist Hider: Processed ${blockedArtists.size} artists from the blocklist.`);
                    if (blockedArtists.size > 0) {
                         console.log("Blocked artists (first 10):", Array.from(blockedArtists).slice(0, 10).join(', ') + (blockedArtists.size > 10 ? '...' : ''));
                    }

                    if (blockedArtists.size === 0) {
                        console.warn("DA Blocklist Hider: Blocklist resulted in zero valid usernames!");
                    }

                    addHideStyles();
                    setTimeout(processDeviations, 500);
                    observeMutations();
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

    function processDeviations() {
        if (blockedArtists.size === 0) return;

        const artistLinks = document.querySelectorAll('a[data-username]:not(.da-blocked-link)');

        artistLinks.forEach(link => {
            link.classList.add('da-blocked-link');

            const username = link.dataset.username.toLowerCase();

            if (blockedArtists.has(username)) {
                const innerContainer = link.closest('div._3Y0hT._3oBlM');
                const gridItemContainer = innerContainer ? innerContainer.parentElement : null;
                const deviationCardContainer = link.closest('div[data-testid="deviation_card"]');
                const articleContainer = link.closest('article[data-hook="deviation_std"]');
                const cellContainer = link.closest('div[data-hook="deviation_cell"]');
                // Add more potential top-level container selectors here if needed
                // const someOtherContainer = link.closest('.some-other-class');

                let containerToHide = null;

                if (gridItemContainer && gridItemContainer.matches('div[style*="display:inline-block"]')) {
                    containerToHide = gridItemContainer;
                } else if (deviationCardContainer) {
                    containerToHide = deviationCardContainer;
                } else if (articleContainer) {
                     containerToHide = articleContainer;
                } else if (cellContainer) {
                     containerToHide = cellContainer;
                }
                // else if (someOtherContainer) { // Example if you find another wrapper
                //     containerToHide = someOtherContainer;
                // }
                 else if (innerContainer) {
                    containerToHide = innerContainer;
                    console.warn(`DA Blocklist Hider: Using fallback inner container for ${username}.`);
                }

                if (containerToHide && !containerToHide.classList.contains('da-blocked-deviation-container')) {
                    console.log(`DA Blocklist Hider: Hiding & Collapsing deviation by blocked artist: ${username}`);
                    containerToHide.classList.add('da-blocked-deviation-container');
                } else if (!containerToHide && !link.closest('.da-blocked-deviation-container')) {
                    console.warn(`DA Blocklist Hider: Could not find suitable container for blocked artist link: ${username}`, link);
                }
            }
        });
    }

    function observeMutations() {
        const targetNode = document.body;
        const config = { childList: true, subtree: true };
        let debounceTimer;

        const callback = function(mutationsList, observer) {
            let potentiallyRelevantChange = false;
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches('a[data-username]:not(.da-blocked-link)') || node.querySelector('a[data-username]:not(.da-blocked-link)')) {
                                potentiallyRelevantChange = true;
                                break;
                            }
                        }
                    }
                }
                if (potentiallyRelevantChange) break;
            }

            if (potentiallyRelevantChange) {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(processDeviations, 0);
            }
        };

        const observer = new MutationObserver(callback);
        observer.observe(targetNode, config);
        console.log("DA Blocklist Hider: MutationObserver watching for new content.");
    }

    // --- Start ---
    fetchBlocklist();

})();