export const COCKPIT_SHELL = `
    <div class="loading" id="loading" role="status" aria-live="polite">
      <div class="loading-content">
        <span class="loading-kicker">AI LAB / KANTOR VIRTUAL</span>
        <strong>Menyiapkan kantor AI Lab</strong>
        <p id="loadingSub">Memuat ruang 3D dan status publik.</p>
        <span class="loading-track" aria-hidden="true"><span class="loading-bar"></span></span>
        <button id="btnLightMode" class="text-button" type="button" hidden>
          Gunakan tampilan ringan
        </button>
      </div>
    </div>

    <main class="workspace">
      <section class="office-stage" aria-label="Visualisasi kantor 3D">
        <div id="scene" aria-hidden="true"></div>
        <div id="labels" class="labels-layer" aria-hidden="true"></div>
        <div id="sceneFallback" class="scene-fallback" hidden>
          <strong>Ruang 3D tidak tersedia</strong>
          <p>Status agent tetap dapat dibaca pada kartu dan linimasa di halaman ini.</p>
        </div>
        <p class="stage-hint">
          Seret untuk melihat ruang · Gulir atau cubit untuk zoom · Klik meja atau pilih kartu agent
        </p>
      </section>

      <header class="top-bar top" aria-label="Ringkasan kantor">
        <div class="brand-block brand card-ui">
          <h1>Ruang Kerja Tim <span id="workspaceTitle"></span></h1>
          <p id="systemPhase" aria-live="polite">Memuat…</p>
        </div>

        <div class="roadmap-card card-ui" aria-label="Progres roadmap" title="Data roadmap belum tersedia dari personal-agentic.">
          <div class="roadmap-status-row">
            <span class="live" role="status" aria-live="polite">
              <i class="dot pulse-dot" id="liveDot" aria-hidden="true"></i>
              <span id="liveStatus">Menghubungkan…</span>
            </span>
            <span class="roadmap-percent">Progres roadmap <b id="statRoadmapPercent">—</b></span>
          </div>
          <div class="roadmap-bar" aria-hidden="true">
            <div class="roadmap-fill" id="statRoadmapFill" style="width: 0%"></div>
          </div>
          <span id="syncTime" class="sr">Belum tersinkron</span>
        </div>

        <div class="metrics stats card-ui" aria-label="Ringkasan tugas">
          <div class="stat metric">
            <small>Status</small>
            <span class="live" role="status" aria-live="polite">
              <i class="dot" aria-hidden="true"></i>
              <span id="liveTxt">Menghubungkan…</span>
            </span>
          </div>
          <div class="stat metric">
            <small>Tugas selesai</small>
            <b id="statDone">—</b>
          </div>
          <div class="stat metric">
            <small>Aktif sekarang</small>
            <b id="statTasks">—</b>
          </div>
          <div class="stat metric desktop-stat" id="statTokensCol">
            <small>Token diproses</small>
            <b id="statTokens">—</b>
          </div>
          <div class="stat metric desktop-stat" id="officeTimeCol">
            <small>Sesi kerja</small>
            <time id="officeTime" aria-label="Jam perangkat dalam WIB">--:-- WIB</time>
          </div>
          <b id="statApproval" class="sr">0</b>
        </div>

        <div class="header-actions">
          <button
            id="btnToggleSidebars"
            class="control-button toggle card-ui"
            type="button"
            aria-expanded="true"
            aria-label="Tampilkan atau sembunyikan panel informasi"
            title="Tombol pintas: H"
          >
            Lihat kantor penuh
          </button>
        </div>
      </header>

      <section class="detail-panel" aria-label="Rincian lab">
        <div class="detail-panels" id="mobilePanelContent">
          <aside
            class="side-panel left side card-ui"
            id="feedPanel"
            aria-label="Aktivitas langsung"
            aria-labelledby="feedHeading"
          >
            <header class="panel-header">
              <h2 id="feedHeading">Aktivitas agent</h2>
              <span class="hright panel-controls">
                <span id="feedCount" class="chip count-badge">0</span>
                <button
                  id="btnMinLeft"
                  class="icon-button minbtn"
                  type="button"
                  aria-expanded="true"
                  aria-label="Perkecil panel aktivitas"
                  title="Perkecil / buka panel"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path
                      d="M6 9l6 6 6-6"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.4"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  <span class="sr">Perkecil panel</span>
                </button>
              </span>
            </header>
            <div class="panel-scroll scroll">
              <ul class="activity-feed feed" id="feedList">
                <li class="empty-state">Mengambil aktivitas dari ledger.</li>
              </ul>
            </div>
          </aside>

          <aside
            class="side-panel right side card-ui"
            id="statusPanel"
            aria-label="Riwayat dan daftar tugas"
          >
            <div class="panel-header tabrow">
              <div class="tabs tabs-container" role="tablist" aria-label="Riwayat dan daftar tugas">
                <button
                  class="tab-btn"
                  role="tab"
                  id="tabTasks"
                  data-tab="riwayat"
                  aria-selected="true"
                  aria-controls="paneTasks"
                  type="button"
                >
                  Riwayat<span class="n chip count-badge" id="nRuns">0</span>
                </button>
                <button
                  class="tab-btn"
                  role="tab"
                  id="tabAbout"
                  data-tab="tugas"
                  aria-selected="false"
                  aria-controls="paneAbout"
                  type="button"
                >
                  Tugas&nbsp;<span id="tugasWho">Orion</span
                  ><span class="n chip count-badge" id="nTodo">0</span>
                </button>
                <button
                  class="tab-btn mfeed"
                  role="tab"
                  id="tabFeed"
                  data-tab="feed2"
                  aria-selected="false"
                  aria-controls="paneMobileFeed"
                  type="button"
                  hidden
                >
                  Aktivitas
                </button>
              </div>
              <button
                id="btnMinRight"
                class="icon-button minbtn"
                type="button"
                aria-expanded="true"
                aria-label="Perkecil panel status"
                title="Perkecil / buka panel"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path
                    d="M6 9l6 6 6-6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <span class="sr">Perkecil panel</span>
              </button>
            </div>
            <div class="panel-scroll scroll">
              <section
                class="tab-pane pane active on"
                id="paneTasks"
                role="tabpanel"
                aria-labelledby="tabTasks"
              >
                <div class="src">Sumber: <b>ledger publik</b> (terbaru di atas)</div>
                <div id="runsList" class="runs-list">
                  <p class="empty-state">Belum ada riwayat tugas selesai.</p>
                </div>
              </section>
              <section
                class="tab-pane pane"
                id="paneAbout"
                role="tabpanel"
                aria-labelledby="tabAbout"
                hidden
              >
                <div class="src">Sumber: <b>papan tugas & antrean lab</b></div>
                <div id="todoContent" class="todo-content"></div>
              </section>
              <section
                class="tab-pane pane"
                id="paneMobileFeed"
                role="tabpanel"
                aria-labelledby="tabFeed"
                hidden
              >
                <ul class="activity-feed feed" id="feedListMobile">
                  <li class="empty-state">Mengambil aktivitas dari ledger.</li>
                </ul>
              </section>
            </div>
          </aside>
        </div>
      </section>

      <nav class="agent-grid cards" id="agentGrid" aria-label="Fokus ke agent"></nav>

      <button
        id="btnResetCamera"
        class="sr-utility-reset"
        type="button"
        aria-hidden="true"
        tabindex="-1"
        title="Kembalikan sudut kamera"
      >
        Sudut awal
      </button>
    </main>`;
