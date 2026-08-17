/** Missed heartbeats allowed before a device is dropped. */
export const MISSED_HEARTBEATS_LIMIT = 5;

/** Heartbeat broadcast interval in ms. */
export const HEARTBEAT_INTERVAL = 5_000;

/** Device removal after missed heartbeats, ms (5 missed × 5s interval). */
export const HEARTBEAT_TIMEOUT = HEARTBEAT_INTERVAL * MISSED_HEARTBEATS_LIMIT;

/** Connection establishment timeout, ms. */
export const CONNECTION_TIMEOUT = 10_000;

/** Overall transfer timeout, ms (5 minutes). */
export const TRANSFER_TIMEOUT = 300_000;
