'use strict';
// NEXT_FONT_GOOGLE_MOCKED_RESPONSES module for `vote-list-server.cjs --font-mock`: every Google Fonts request gets this CSS.
module.exports = new Proxy({}, { get: () => '@font-face {font-family: Inter; src: local(Arial); font-weight: 100 900; font-style: normal;}' });
