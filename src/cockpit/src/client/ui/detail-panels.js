export function setupDetailPanels({ documentRef = document, windowRef = window } = {}) {
  const workspace = documentRef.querySelector('.workspace');
  const leftPanel = documentRef.querySelector('.side-panel.left');
  const rightPanel = documentRef.querySelector('.side-panel.right');
  const agentGrid = documentRef.getElementById('agentGrid');
  const detailPanel = documentRef.querySelector('.detail-panel');
  const content = documentRef.getElementById('mobilePanelContent');
  const toggle = documentRef.getElementById('btnToggleSidebars');
  const leftButton = documentRef.getElementById('btnMinLeft');
  const rightButton = documentRef.getElementById('btnMinRight');
  const mobileQuery = windowRef.matchMedia('(max-width: 820px)');
  const narrowQuery = windowRef.matchMedia('(max-width: 1180px)');
  const removers = [];
  let mobile = mobileQuery.matches;

  function isMinimized(panel) {
    return Boolean(panel?.classList.contains('minimized'));
  }

  function desktopSnapshot() {
    return {
      hidden: Boolean(workspace?.classList.contains('panels-hidden')),
      leftMinimized: isMinimized(leftPanel),
      rightMinimized: isMinimized(rightPanel)
    };
  }

  const storage = (() => {
    try {
      return windowRef?.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
    } catch {
      return null;
    }
  })();

  function loadSavedDesktopPreference() {
    if (!storage) return null;
    try {
      const savedLapang = storage.getItem('cockpit.lapang') ?? storage.getItem('kantor.lapang');
      const savedMinLeft =
        storage.getItem('cockpit.min.left') ?? storage.getItem('kantor.min.left');
      const savedMinRight =
        storage.getItem('cockpit.min.right') ?? storage.getItem('kantor.min.right');
      if (savedLapang === null && savedMinLeft === null && savedMinRight === null) {
        return null;
      }
      return {
        hidden:
          savedLapang !== null
            ? savedLapang === '1'
            : Boolean(workspace?.classList.contains('panels-hidden')),
        leftMinimized: savedMinLeft !== null ? savedMinLeft === '1' : isMinimized(leftPanel),
        rightMinimized: savedMinRight !== null ? savedMinRight === '1' : isMinimized(rightPanel)
      };
    } catch {
      return null;
    }
  }

  function persistDesktopPreference(pref) {
    if (!storage || !pref) return;
    try {
      storage.setItem('cockpit.lapang', pref.hidden ? '1' : '0');
      storage.setItem('cockpit.min.left', pref.leftMinimized ? '1' : '0');
      storage.setItem('cockpit.min.right', pref.rightMinimized ? '1' : '0');
    } catch {
      // ignore
    }
  }

  const savedPreference = loadSavedDesktopPreference();
  if (savedPreference && !mobile) {
    workspace?.classList.toggle('panels-hidden', savedPreference.hidden);
    setMinimized(leftPanel, leftButton, 'left', savedPreference.leftMinimized);
    setMinimized(rightPanel, rightButton, 'right', savedPreference.rightMinimized);
  }

  let desktopPreference = savedPreference || desktopSnapshot();

  function listen(target, type, handler) {
    target?.addEventListener(type, handler);
    removers.push(() => target?.removeEventListener(type, handler));
  }

  function setMinimized(panel, button, side, minimized) {
    const scroll = panel?.querySelector('.panel-scroll');
    if (minimized && scroll?.contains(documentRef.activeElement)) button?.focus();
    panel?.classList.toggle('minimized', minimized);
    panel?.classList.toggle('min', minimized);
    documentRef.body.classList.toggle(`min-${side}`, minimized);
    button?.setAttribute('aria-expanded', String(!minimized));
    const label = side === 'left' ? 'aktivitas' : 'status';
    button?.setAttribute('aria-label', `${minimized ? 'Perluas' : 'Perkecil'} panel ${label}`);
    if (scroll) scroll.inert = minimized;
  }

  function updatePresentation() {
    const hidden = !mobile && Boolean(workspace?.classList.contains('panels-hidden'));
    const active = documentRef.activeElement;
    if (content) content.hidden = false;
    if (toggle) {
      toggle.hidden = mobile;
      toggle.textContent = hidden ? 'Tampilkan panel' : 'Lihat kantor penuh';
      toggle.setAttribute('aria-expanded', String(!hidden));
    }
    if (leftPanel) {
      leftPanel.hidden = narrowQuery.matches;
      leftPanel.inert = narrowQuery.matches || hidden;
      for (const button of leftPanel.querySelectorAll('button')) {
        button.hidden = narrowQuery.matches;
      }
    }
    if (rightPanel) {
      rightPanel.hidden = false;
      rightPanel.inert = hidden;
      if (rightButton) rightButton.hidden = false;
    }
    if ((mobile && active === toggle) || (narrowQuery.matches && leftPanel?.contains(active))) {
      if (hidden) toggle?.focus();
      else rightButton?.focus();
    }
    if (agentGrid && detailPanel && workspace) {
      if (mobile && agentGrid.nextElementSibling !== detailPanel) {
        workspace.insertBefore(agentGrid, detailPanel);
      } else if (!mobile && workspace.lastElementChild !== agentGrid) {
        workspace.append(agentGrid);
      }
    }
  }

  function setMobileOpen(open, focus = false) {
    if (!mobile) return;
    const scroll = rightPanel?.querySelector('.panel-scroll');
    if (!open && (focus || scroll?.contains(documentRef.activeElement))) rightButton?.focus();
    setMinimized(rightPanel, rightButton, 'right', !open);
    updatePresentation();
  }

  function applyMobile() {
    workspace?.classList.remove('panels-hidden');
    setMinimized(leftPanel, leftButton, 'left', false);
    setMinimized(rightPanel, rightButton, 'right', false);
    updatePresentation();
    if (documentRef.activeElement === toggle || leftPanel?.contains(documentRef.activeElement)) {
      rightButton?.focus();
    }
  }

  listen(mobileQuery, 'change', () => {
    const nextMobile = mobileQuery.matches;
    if (nextMobile === mobile) return;
    if (nextMobile) desktopPreference = desktopSnapshot();
    mobile = nextMobile;
    if (mobile) {
      applyMobile();
    } else {
      if (desktopPreference.hidden && rightPanel?.contains(documentRef.activeElement)) {
        if (toggle) toggle.hidden = false;
        toggle?.focus();
      }
      workspace?.classList.toggle('panels-hidden', desktopPreference.hidden);
      setMinimized(leftPanel, leftButton, 'left', desktopPreference.leftMinimized);
      setMinimized(rightPanel, rightButton, 'right', desktopPreference.rightMinimized);
      updatePresentation();
    }
  });
  listen(narrowQuery, 'change', updatePresentation);

  for (const [button, panel, side] of [
    [leftButton, leftPanel, 'left'],
    [rightButton, rightPanel, 'right']
  ]) {
    listen(button, 'click', () => {
      if (mobile) {
        if (side === 'right') setMobileOpen(isMinimized(rightPanel));
        return;
      }
      setMinimized(panel, button, side, !isMinimized(panel));
      desktopPreference = desktopSnapshot();
      persistDesktopPreference(desktopPreference);
    });
  }

  listen(toggle, 'click', () => {
    if (mobile) return;
    const hidden = workspace?.classList.toggle('panels-hidden');
    if (
      hidden &&
      [leftPanel, rightPanel].some((panel) => panel?.contains(documentRef.activeElement))
    ) {
      toggle.focus();
    }
    desktopPreference = desktopSnapshot();
    persistDesktopPreference(desktopPreference);
    updatePresentation();
  });

  listen(windowRef, 'keydown', (event) => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape' && mobile) {
      if (!isMinimized(rightPanel)) {
        event.preventDefault();
        setMobileOpen(false, true);
      }
      return;
    }
    const active = documentRef.activeElement;
    if (
      (event.key === 'h' || event.key === 'H') &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(active?.tagName) &&
      !active?.isContentEditable
    ) {
      if (mobile) setMobileOpen(isMinimized(rightPanel));
      else toggle?.click();
    }
  });

  if (mobile) applyMobile();
  else {
    setMinimized(leftPanel, leftButton, 'left', desktopPreference.leftMinimized);
    setMinimized(rightPanel, rightButton, 'right', desktopPreference.rightMinimized);
    updatePresentation();
  }

  return {
    isMobileOpen: () => mobile && !isMinimized(rightPanel),
    collapseMobile: () => setMobileOpen(false),
    expandMobile: () => setMobileOpen(true),
    dispose: () => removers.forEach((remove) => remove())
  };
}
