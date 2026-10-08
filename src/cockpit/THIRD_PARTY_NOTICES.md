# Third-party notices

## kantor-agent

The AI Lab Cockpit frontend adapts visual patterns from [kantor-agent](https://github.com/humaedihume/kantor-agent), commit `ad92a7a473b3d0e769281d552cee74cbb4004a54`. No vendor tree or private runtime data is included.

Agent-card surface, avatar, chip, and typography styles are adapted from
`skills/kantor-agent/runtime/views/page.html`, and the card structure follows
`cardHtml` in `runtime/public/assets/kantor.js`. The cockpit retains its own safe
DOM creation, public-state labels, coordinated responsive reflow, and accessible
drawer state. The reference runtime and transcript reader are not copied.

Speech-bubble dimensions, surface, border, tail, and shadow also adapt
`runtime/views/page.html`. Walking speed, angular interpolation, pose rhythms,
destination dwell, arrival-comment probability, and dialogue timings adapt
`runtime/public/assets/kantor.js` at the same pinned commit. Dialogue text is
rewritten for cockpit locations, while its clock, safe paths, local rig, public
state gates, provenance, and responsive bubble quota remain cockpit-owned.

MIT License

Copyright (c) 2026 humaedihume

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
