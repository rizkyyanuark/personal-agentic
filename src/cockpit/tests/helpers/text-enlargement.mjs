export function createTextEnlargementFixture(doc = globalThis.document) {
  const view = doc.defaultView;
  const getHosts = () =>
    [
      ...doc.querySelectorAll(
        '#statusPanel [role="tab"], #statusPanel [role="tab"] *, .metrics .metric, .metrics .metric *'
      )
    ].filter((element) =>
      [...element.childNodes].some(
        (node) => node.nodeType === view.Node.TEXT_NODE && /\S/.test(node.textContent)
      )
    );
  const hosts = getHosts().map((element, index) => ({
    element,
    index,
    id: element.id || `${element.localName}-${index}`,
    group: element.closest('[role="tab"]') ? 'tab' : 'metric',
    size: parseFloat(view.getComputedStyle(element).fontSize),
    fontValue: element.style.getPropertyValue('font-size'),
    fontPriority: element.style.getPropertyPriority('font-size'),
    transitionValue: element.style.getPropertyValue('transition'),
    transitionPriority: element.style.getPropertyPriority('transition'),
    hadStyleAttribute: element.hasAttribute('style')
  }));
  const read = () => {
    const current = getHosts();
    return {
      fontSizes: hosts.map(({ element, index, id, group }) => ({
        index,
        id,
        group,
        size: parseFloat(view.getComputedStyle(element).fontSize)
      })),
      viewport: [view.innerWidth, view.innerHeight],
      dpr: view.devicePixelRatio,
      hostsConnected: hosts.every(({ element }) => element.isConnected),
      currentHostsMatch:
        current.length === hosts.length &&
        hosts.every(({ element }, index) => current[index] === element)
    };
  };
  return {
    baseline: {
      fontSizes: hosts.map(({ index, id, group, size }) => ({ index, id, group, size })),
      viewport: [view.innerWidth, view.innerHeight],
      dpr: view.devicePixelRatio
    },
    apply() {
      for (const { element, size } of hosts) {
        element.style.setProperty('transition', 'none', 'important');
        element.style.setProperty('font-size', `${size * 2}px`, 'important');
      }
      return read();
    },
    inspect: read,
    restore() {
      for (const {
        element,
        fontValue,
        fontPriority,
        transitionValue,
        transitionPriority,
        hadStyleAttribute
      } of hosts) {
        if (fontValue) element.style.setProperty('font-size', fontValue, fontPriority);
        else element.style.removeProperty('font-size');
        if (typeof element.offsetHeight === 'number') {
          void element.offsetHeight;
        }
        if (transitionValue)
          element.style.setProperty('transition', transitionValue, transitionPriority);
        else element.style.removeProperty('transition');
        if (!hadStyleAttribute && element.style.length === 0) {
          while (element.hasAttribute('style')) element.removeAttribute('style');
        }
      }
      return {
        ...read(),
        inlineRestored: hosts.every(
          ({
            element,
            fontValue,
            fontPriority,
            transitionValue,
            transitionPriority,
            hadStyleAttribute
          }) =>
            element.style.getPropertyValue('font-size') === fontValue &&
            element.style.getPropertyPriority('font-size') === fontPriority &&
            element.style.getPropertyValue('transition') === transitionValue &&
            element.style.getPropertyPriority('transition') === transitionPriority &&
            (hadStyleAttribute || element.style.length > 0 || !element.hasAttribute('style'))
        )
      };
    }
  };
}
