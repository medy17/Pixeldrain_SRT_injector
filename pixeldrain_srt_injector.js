// ==UserScript==
// @name         Pixeldrain SRT Injector
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Adds a "Load SRT" button with custom Netflix-style subtitles. Album-aware.
// @author       medy17
// @match        *://pixeldrain.com/u/*
// @match        *://pixeldrain.com/l/*
// @icon         https://pixeldrain.com/res/img/pixeldrain_196.png
// @resource     NetflixSans https://github.com/skb10x/Netflix-Sans-FONT-CSS-FontFace/raw/refs/heads/main/Netflix%20Sans%20Medium.ttf
// @grant        unsafeWindow
// @grant        GM_getResourceURL
// @noframes
// ==/UserScript==

(function() {
    'use strict';

    let subtitles = [];
    let video = null;
    let subtitleContainer = null;
    let uiInitialized = false;
    let activeSubtitleContextId = null;

    // ---- Helper Functions (Parsing and Display) ----

    function timeToSeconds(timeStr) {
        const [hms, ms] = timeStr.replace(',', '.').split('.');
        const [h, m, s] = hms.split(':').map(Number);
        return h * 3600 + m * 60 + s + parseFloat(`0.${ms || 0}`);
    }

    function parseSRT(data) {
        const parsedSubtitles = [];
        const normalizedData = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const blocks = normalizedData.split('\n\n');

        for (const block of blocks) {
            const trimmedBlock = block.trim();
            if (!trimmedBlock) continue;

            const lines = trimmedBlock.split('\n');
            const timestampLine = lines.find(line => line.includes('-->'));
            if (!timestampLine) continue;

            const timeMatch = timestampLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d+)\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d+)/);
            if (!timeMatch) continue;

            const startTime = timeToSeconds(timeMatch[1]);
            const endTime = timeToSeconds(timeMatch[2]);
            const textIndex = lines.indexOf(timestampLine) + 1;
            const text = lines.slice(textIndex).join('<br>').replace(/<[^>]*>/g, (match) => match === '<br>' ? match : '');

            if (text) {
                parsedSubtitles.push({ startTime, endTime, text });
            }
        }
        return parsedSubtitles;
    }

    function updateSubtitle() {
        if (!video || !subtitleContainer || subtitles.length === 0) return;

        const currentTime = video.currentTime;
        const currentSubtitle = subtitles.find(sub => currentTime >= sub.startTime && currentTime <= sub.endTime);

        if (currentSubtitle) {
            if (subtitleContainer.innerHTML !== currentSubtitle.text) {
                subtitleContainer.innerHTML = currentSubtitle.text;
            }
            subtitleContainer.style.visibility = 'visible';
        } else {
            subtitleContainer.style.visibility = 'hidden';
        }
    }

    function clearSubtitles() {
        subtitles = [];
        activeSubtitleContextId = null;
        if (subtitleContainer) {
            subtitleContainer.innerHTML = '';
            subtitleContainer.style.visibility = 'hidden';
        }
        if (video) {
            video.removeEventListener('timeupdate', updateSubtitle);
        }
    }

    function setupUI() {
        video = document.querySelector('video');
        if (!video) return;

        const toolbar = document.querySelector('.toolbar');
        const templateButton = document.querySelector('.toolbar_button');
        const separatorTemplate = document.querySelector('.toolbar .separator');
        if (!toolbar || !templateButton || !separatorTemplate) return;

        uiInitialized = true;
        console.log("SRT Overlay: All elements found. Initializing UI.");

        // Get the local, cached URL of the font from Tampermonkey
        const fontURL = GM_getResourceURL('NetflixSans');
        const style = document.createElement('style');
        style.textContent = `
          @font-face {
            font-family: 'Netflix Sans';
            src: url('${fontURL}') format('truetype');
          }
        `;
        document.head.appendChild(style);

        video.addEventListener('loadstart', () => {
            setTimeout(() => {
                const newVideoId = unsafeWindow.viewer_data?.api_response?.id;
                if (newVideoId && newVideoId !== activeSubtitleContextId) {
                    clearSubtitles();
                }
            }, 100);
        });

        subtitleContainer = document.createElement('div');
        subtitleContainer.id = 'srt-overlay-container';
        Object.assign(subtitleContainer.style, {
            position: 'absolute', bottom: '8%', left: '50%', transform: 'translateX(-50%)',
            width: '90%', maxWidth: '800px', textAlign: 'center',
            fontFamily: "'Netflix Sans', Arial, sans-serif",
            fontSize: 'clamp(18px, 2.8vw, 36px)',
            color: 'white',
            backgroundColor: 'transparent',
            textShadow: '0 2px 5px rgba(0,0,0,0.95)',
            zIndex: '2147483647', pointerEvents: 'none', visibility: 'hidden',
            boxSizing: 'border-box', lineHeight: '1.3em',
        });

        const videoParent = video.parentElement;
        if (getComputedStyle(videoParent).position === 'static') {
            videoParent.style.position = 'relative';
        }
        videoParent.appendChild(subtitleContainer);

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.srt';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const currentVideo = unsafeWindow.viewer_data?.api_response;
                    if (!currentVideo) {
                        alert("Error: Could not identify the current video.");
                        return;
                    }
                    subtitles = parseSRT(e.target.result);
                    activeSubtitleContextId = currentVideo.id;
                    const fileName = currentVideo.name || `file ${currentVideo.id}`;
                    alert(`Loaded ${subtitles.length} subtitles for "${fileName}".`);
                    video.removeEventListener('timeupdate', updateSubtitle);
                    video.addEventListener('timeupdate', updateSubtitle);
                };
                reader.readAsText(file);
            }
        });

        const srtButton = templateButton.cloneNode(true);
        srtButton.removeAttribute('href');
        srtButton.removeAttribute('title');
        srtButton.querySelector('i').textContent = 'subtitles';
        srtButton.querySelector('span').textContent = 'Load SRT';

        srtButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileInput.click();
        });

        const newSeparator = separatorTemplate.cloneNode(true);
        separatorTemplate.parentNode.insertBefore(newSeparator, separatorTemplate.nextSibling);
        newSeparator.parentNode.insertBefore(srtButton, newSeparator.nextSibling);
    }

    const observer = new MutationObserver((mutations, obs) => {
        if (uiInitialized) {
            obs.disconnect();
            return;
        }
        if (document.querySelector('video') && document.querySelector('.toolbar_button')) {
            setupUI();
            obs.disconnect();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();