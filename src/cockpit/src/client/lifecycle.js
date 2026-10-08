export function createDomScope(container) {
  const doc = container.ownerDocument;
  return {
    getElementById: (id) => container.querySelector(`[id="${id}"]`),
    querySelector: (selector) => container.querySelector(selector),
    querySelectorAll: (selector) => container.querySelectorAll(selector),
    createElement: (tag) => doc.createElement(tag),
    createTextNode: (value) => doc.createTextNode(value),
    get hidden() {
      return doc.hidden;
    },
    get activeElement() {
      return doc.activeElement;
    },
    body: container,
    addEventListener: (...args) => doc.addEventListener(...args),
    removeEventListener: (...args) => doc.removeEventListener(...args)
  };
}

export function createScopedView(container) {
  const view = container.ownerDocument.defaultView;
  const resizeTarget = new view.EventTarget();
  const queries = new Map();
  const observer = new view.ResizeObserver(() => {
    for (const query of queries.values()) {
      const next = query.measure();
      if (next !== query.matches) {
        query.matches = next;
        query.dispatchEvent(new view.Event('change'));
      }
    }
    resizeTarget.dispatchEvent(new view.Event('resize'));
  });
  observer.observe(container);
  const targetFor = (type) =>
    type === 'resize' ? resizeTarget : type === 'keydown' ? container : view;
  return new Proxy(view, {
    get(target, key) {
      if (key === 'innerWidth') return container.clientWidth;
      if (key === 'innerHeight') return container.clientHeight;
      if (key === 'dispose')
        return () => {
          observer.disconnect();
          queries.clear();
        };
      if (key === 'addEventListener' || key === 'removeEventListener')
        return (type, ...args) => targetFor(type)[key](type, ...args);
      if (key === 'matchMedia')
        return (media) => {
          const size = /^\((max|min)-width:\s*(\d+)px\)$/.exec(media);
          if (!size) return target.matchMedia(media);
          if (!queries.has(media)) {
            const query = new view.EventTarget();
            query.media = media;
            query.measure = () =>
              size[1] === 'max'
                ? container.clientWidth <= Number(size[2])
                : container.clientWidth >= Number(size[2]);
            query.matches = query.measure();
            queries.set(media, query);
          }
          return queries.get(media);
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

export function disposeResource(resource, disposedResources) {
  if (!resource || disposedResources.has(resource)) return;
  disposedResources.add(resource);
  if (resource.isMaterial) {
    for (const value of Object.values(resource))
      if (value?.isTexture) disposeResource(value, disposedResources);
  }
  resource.dispose();
}

export function disposeObjectTree(root, disposedResources = new Set()) {
  const resources = new Set();
  const collectMaterial = (material) => {
    if (!material) return;
    resources.add(material);
    for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
  };
  root.traverse((object) => {
    if (object.geometry) resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      collectMaterial(material);
    if (object.shadow?.map) resources.add(object.shadow.map);
  });
  if (root.environment) resources.add(root.environment);
  if (root.background?.isTexture) resources.add(root.background);
  resources.forEach((resource) => disposeResource(resource, disposedResources));
}
