export {
  IndexedDBBackend,
  type IndexedDbSaveOptions,
} from './indexed-db-backend';
export {
  LocalStorageBackend,
} from './local-storage-backend';
export {
  type MigrateFn,
  MigrationRegistry,
} from './migration-registry';
export {
  computeChecksum,
  createEnvelope,
  type SaveEnvelope,
  SaveStorage,
  verifyEnvelope,
} from './save-storage';
