import '@testing-library/jest-dom';

jest.mock('sweetalert2', () => ({
  __esModule: true,
  default: {
    fire: jest.fn(),
    showLoading: jest.fn(),
  },
  fire: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
  db: {},
  auth: {},
  storage: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(async () => ({
    exists: () => false,
    data: () => ({}),
  })),
  getDocs: jest.fn(async () => ({
    empty: true,
    docs: [],
    forEach: () => {},
  })),
  onSnapshot: jest.fn((_ref, next, error) => {
    try {
      if (typeof next === 'function') {
        next({
          empty: true,
          docs: [],
          forEach: () => {},
        });
      }
    } catch (e) {
      if (typeof error === 'function') {
        error(e);
      }
    }
    return () => {};
  }),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  serverTimestamp: jest.fn(() => new Date()),
  writeBatch: jest.fn(() => ({
    set: jest.fn(),
    update: jest.fn(),
    commit: jest.fn(async () => {}),
  })),
}));

jest.mock('@/lib/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
}));

global.fetch = jest.fn(async () => ({
  ok: true,
  json: async () => [],
})) as unknown as typeof fetch;
