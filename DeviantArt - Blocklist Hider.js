// ==UserScript==
// @name         DeviantArt - Blocklist Hider v2.7
// @namespace    http://tampermonkey.net/
// @version      2.7
// @description  Hides deviations/subs from artists (username/URL list), usernames with keywords, AND deviation titles with keywords. Flexible container finding. Collapses space. Processes immediately.
// @author       nekohacker591 (modified by AI)
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
    // These keywords will be checked against BOTH usernames AND deviation titles
    const wildcardBlockKeywords = [
        'photography', 'stock', '3d', 'model', 'nature', 'ero',
        'nude', 'onlyfans', 'of', 'promo', 'porn', 'blender',
        'studio', 'graphy', 'imagery', 'subscribe', 'photo',
        'commission', // Example: Added commission
        'adopt',      // Example: Added adopt
        'trade',      // Example: Added trade based on your example
        'ych',        // Example: Added YCH
        'art',
        'arts'
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
                 display: none !important; height: 0 !important; width: 0 !important;
                 margin: 0 !important; padding: 0 !important; border: none !important;
                 font-size: 0 !important; overflow: hidden !important; visibility: hidden !important;
                 float: none !important; position: static !important;
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
                    if (blockedArtists.size === 0 && wildcardBlockKeywords.length === 0) {
                        console.warn("DA Blocklist Hider: Blocklist and keywords are empty! Script won't hide anything.");
                    }
                    console.log(`DA Blocklist Hider: Added ${wildcardBlockKeywords.length} wildcard keywords (for user & title): [${wildcardBlockKeywords.join(', ')}]`);

                    addHideStyles();
                    setTimeout(processDeviations, 250); // Delay initial run slightly
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

    /** Checks if a string contains any of the wildcard keywords */
    function checkStringForWildcards(text) {
        if (!text || wildcardBlockKeywords.length === 0) {
            return false;
        }
        const lowerText = text.toLowerCase();
        return wildcardBlockKeywords.some(keyword => lowerText.includes(keyword));
    }

    /** Finds the matching keyword if a string contains any wildcard */
    function findMatchingWildcard(text) {
        if (!text || wildcardBlockKeywords.length === 0) {
            return null;
        }
        const lowerText = text.toLowerCase();
        return wildcardBlockKeywords.find(keyword => lowerText.includes(keyword)) || null;
    }


    /**
     * Finds the most appropriate container element to hide based on the artist link.
     * (Same logic as v2.6)
     */
    function findContainerToHide(link) {
        let container = link.closest('div[data-testid="deviation_card"]') ||
                        link.closest('article[data-hook="deviation_std"]') ||
                        link.closest('div[data-hook="deviation_cell"]');
        if (container) return container;

        let currentElement = link;
        for (let i = 0; i < 8; i++) {
             if (!currentElement || currentElement === document.body) break;
             let parent = currentElement.parentElement;
             if (parent && parent.matches('div')) {
                 const subLink = parent.querySelector(':scope > a[href*="/subscriptions/"]');
                 const hasSubClasses = parent.matches('._3Y0hT, ._3i0Iq');
                 if ((subLink || hasSubClasses) && parent.contains(link)) {
                     return parent;
                 }
             }
             currentElement = parent;
        }

        const innerContainer = link.closest('div._3Y0hT._3oBlM');
        if (innerContainer) {
             const gridItemContainer = innerContainer.parentElement;
             if (gridItemContainer && gridItemContainer.matches('div[style*="display:inline-block"], div[style*="flex-basis"]')) {
                 return gridItemContainer;
             }
             // Fallback removed for now as it was less reliable. Consider re-adding if necessary.
             // return innerContainer;
        }

        container = link.closest('figure') || link.closest('div:has(> a[href*="/art/"])');
        if (container) return container;

        // console.warn(`DA Blocklist Hider: Could not reliably identify container for link:`, link); // Keep this warning internal for now
        return null;
    }


    function processDeviations() {
        if (blockedArtists.size === 0 && wildcardBlockKeywords.length === 0) return;

        // Find all unprocessed links, not just artist links initially
        // This helps catch cases where the relevant link isn't the artist one but contains the title info needed
        const potentialLinks = document.querySelectorAll('a:not(.da-processed-link)');
        if (potentialLinks.length === 0) return;

        // console.log(`DA Blocklist Hider: Processing ${potentialLinks.length} new links/elements...`);

        potentialLinks.forEach(link => {
            link.classList.add('da-processed-link'); // Mark element checked

            // Find the container associated with this element *first*
            const containerToHide = findContainerToHide(link);

            // If we couldn't find a container OR if the container is already marked for hiding, skip further checks for this link
            if (!containerToHide || containerToHide.classList.contains('da-blocked-deviation-container')) {
                return;
            }

            // --- Now check blocking conditions based on the found container ---
            let blockReason = '';
            let matchingKeyword = null;

            // 1. Check Artist Username (List & Wildcard)
            // Find the specific artist link *within* the container
            const artistLink = containerToHide.querySelector('a[data-username]');
            let username = null;
            let usernameLower = null;
            if (artistLink && artistLink.dataset.username) {
                username = artistLink.dataset.username;
                usernameLower = username.toLowerCase();

                if (blockedArtists.has(usernameLower)) {
                    blockReason = `artist list (${username})`;
                } else {
                    matchingKeyword = findMatchingWildcard(usernameLower);
                    if (matchingKeyword) {
                        blockReason = `artist wildcard (${username} contains '${matchingKeyword}')`;
                    }
                }
                // Mark this specific artist link as processed too, if found
                artistLink.classList.add('da-processed-link');
            }

            // 2. Check Image Title Wildcard (Only if not already blocked by artist)
            let imageTitle = null;
            if (!blockReason) {
                // Find the main image within the container
                 const mainImage = containerToHide.querySelector('img[property="contentUrl"], img[src*="wixmp.com"], img[alt]'); // Broader img selector
                if (mainImage && mainImage.alt) {
                    imageTitle = mainImage.alt;
                    const titleLower = imageTitle.toLowerCase();
                    matchingKeyword = findMatchingWildcard(titleLower);
                    if (matchingKeyword) {
                        // Limit title length in log message
                        const truncatedTitle = imageTitle.length > 50 ? imageTitle.substring(0, 47) + '...' : imageTitle;
                        blockReason = `title wildcard ('${truncatedTitle}' contains '${matchingKeyword}')`;
                    }
                }
            }

            // 3. Apply Hiding if a reason was found
            if (blockReason) {
                 // console.log(`DA Blocklist Hider: Hiding content. Reason: ${blockReason}`); // Less noisy log
                 containerToHide.classList.add('da-blocked-deviation-container');
            } else if (!artistLink && !imageTitle && !containerToHide.querySelector('a[href*="/subscriptions/"]')) {
                // If we processed a link but found no artist, title, or sub link within its container,
                // it might have been an irrelevant link. Log this possibility for debugging if needed.
                // console.log("DA Blocklist Hider: Processed link, but no block conditions met and no artist/title found in its container.", link, containerToHide);
            }
        });
        // Clean up any duplicate processed marks if different links pointed to the same container
        document.querySelectorAll('.da-blocked-deviation-container a.da-processed-link').forEach(el => el.classList.add('da-processed-link'));
    }


    function observeMutations() {
        const targetNode = document.body;
        const config = { childList: true, subtree: true };

        const callback = function(mutationsList, observer) {
            let potentiallyRelevantChange = false;
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        // Check more broadly if the added node *might* contain something we care about
                        if (node.nodeType === Node.ELEMENT_NODE && node.matches('a, div, article, figure')) {
                             // Look for unprocessed links *or* potential containers that haven't been hidden yet
                             if (node.querySelector('a:not(.da-processed-link)') || node.matches(':not(.da-blocked-deviation-container)')) {
                                potentiallyRelevantChange = true;
                                break;
                             }
                        }
                    }
                }
                if (potentiallyRelevantChange) break;
            }

            if (potentiallyRelevantChange) {
                // console.log("DA Blocklist Hider: Detected relevant DOM change, processing immediately.");
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
