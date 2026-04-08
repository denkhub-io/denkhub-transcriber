let store = null;

async function getStore() {
  if (store) return store;
  const { default: Store } = await import('electron-store');
  store = new Store({
    name: 'denkhub-transcriber-settings',
    defaults: {
      setupComplete: false,
      modelsDirectory: '',
      transcriptionsDirectory: '',
      lastUsedModel: 'base',
      lastUsedLanguage: 'auto'
    }
  });
  return store;
}

module.exports = {
  get: async (key) => {
    const s = await getStore();
    return s.get(key);
  },
  set: async (key, value) => {
    const s = await getStore();
    s.set(key, value);
  },
  getAll: async () => {
    const s = await getStore();
    return s.store;
  },
  update: async (partial) => {
    const s = await getStore();
    for (const [key, value] of Object.entries(partial)) {
      s.set(key, value);
    }
    return s.store;
  }
};
