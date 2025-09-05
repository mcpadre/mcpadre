// pattern: Functional Core

export {
  detectRemoteSourceType,
  isRemoteSource,
  loadAndValidateRemoteServerSpec,
} from "./remote-serverspec-loader.js";
export {
  DEFAULT_SERVERSPEC_PATTERNS,
  type RemoteFetchResult,
  RemoteServerSpecError,
  type RemoteServerSpecResult,
  type RemoteSourceType,
  type RepositoryInvestigator,
  type ServerSpecFilePatterns,
} from "./types.js";
