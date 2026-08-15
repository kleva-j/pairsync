/** Heartbeat broadcast interval in ms. */
export const HEARTBEAT_INTERVAL = 5_000;

/** Device removal after missed heartbeats, ms (5 missed heartbeats). */
export const HEARTBEAT_TIMEOUT = 25_000;

/** Connection establishment timeout, ms. */
export const CONNECTION_TIMEOUT = 10_000;

/** Overall transfer timeout, ms (5 minutes). */
export const TRANSFER_TIMEOUT = 300_000;
