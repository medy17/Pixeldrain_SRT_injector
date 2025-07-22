// ==UserScript==
// @name         Pixeldrain SRT Injector
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Injects local SRT/VTT files as fully styled, native <track> elements.
// @author       medy17
// @match        *://pixeldrain.com/u/*
// @match        *://pixeldrain.com/l/*
// @icon         https://pixeldrain.com/res/img/pixeldrain_196.png
// @resource     NetflixSans https://github.com/skb10x/Netflix-Sans-FONT-CSS-FontFace/raw/refs/heads/main/Netflix%20Sans%20Medium.ttf
// @grant        unsafeWindow
// @grant        GM_getResourceURL
// ==/UserScript==

(function() {
    'use strict';

    let video = null;
    let uiInitialized = false;
    let activeSubtitleTrack = null;
    let activeBlobUrl = null;

    function srtToVtt(srtText) {
        return 'WEBVTT\n\n' + srtText
            .replace(/\r\n/g, '\n')
            .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    }

    function clearSubtitles() {
        if (activeSubtitleTrack && activeSubtitleTrack.parentNode) {
            activeSubtitleTrack.parentNode.removeChild(activeSubtitleTrack);
            activeSubtitleTrack = null;
        }
        if (activeBlobUrl) {
            URL.revokeObjectURL(activeBlobUrl);
            activeBlobUrl = null;
        }
    }

    function injectSubtitles(subtitleText) {
        clearSubtitles();
        const vttText = srtToVtt(subtitleText);
        const subtitleBlob = new Blob([vttText], { type: 'text/vtt' });
        activeBlobUrl = URL.createObjectURL(subtitleBlob);

        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = 'Local (Custom)';
        track.srclang = 'en';
        track.src = activeBlobUrl;
        track.default = true;

        activeSubtitleTrack = track;
        video.appendChild(track);

        if (video.textTracks && video.textTracks.length > 0) {
            for (let i = 0; i < video.textTracks.length; i++) {
                if (video.textTracks[i].label === 'Local (Custom)') {
                    video.textTracks[i].mode = 'showing';
                    break;
                }
            }
        }
    }

    function setupUI() {
        video = document.querySelector('video');
        const toolbar = document.querySelector('.toolbar');
        const templateButton = document.querySelector('.toolbar_button');
        const separatorTemplate = document.querySelector('.toolbar .separator');

        if (!video || !toolbar || !templateButton || !separatorTemplate) {
            return;
        }

        uiInitialized = true;
        console.log("SRT/VTT Overlay: UI Initialized. Injecting custom styles.");

        const fontURL = GM_getResourceURL('NetflixSans');
        const style = document.createElement('style');
        style.textContent = `
          @font-face {
            font-family: 'Netflix Sans';
            src: url('${fontURL}') format('truetype');
          }

          video::cue {
            font-family: 'Netflix Sans', Arial, sans-serif !important;
            font-size: 75% !important; /* Slightly larger text */
            color: white !important;
            background-color: transparent !important;
            text-shadow: 0 2px 5px rgba(0,0,0,0.9) !important;
          }
        `;
        document.head.appendChild(style);


        video.addEventListener('loadstart', clearSubtitles);

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.srt,.vtt';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    injectSubtitles(e.target.result);
                    alert(`Loaded subtitles from "${file.name}".`);
                };
                reader.readAsText(file);
            }
        });

        const srtButton = templateButton.cloneNode(true);
        srtButton.removeAttribute('href');
        srtButton.removeAttribute('title');
        srtButton.querySelector('i').textContent = 'subtitles';
        srtButton.querySelector('span').textContent = 'Load Subs';

        srtButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileInput.click();
        });

        const newSeparator = separatorTemplate.cloneNode(true);
        separatorTemplate.parentNode.insertBefore(newSeparator, separatorTemplate.nextSibling);
        newSeparator.parentNode.insertBefore(srtButton, newSeparator.nextSibling);
    }

    const masterObserver = new MutationObserver((mutations, obs) => {
        if (uiInitialized) {
            obs.disconnect();
            return;
        }
        if (document.querySelector('video') && document.querySelector('.toolbar_button')) {
            setupUI();
            obs.disconnect();
        }
    });

    masterObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
