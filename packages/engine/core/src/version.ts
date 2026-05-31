/**
 * Engine version + protocol constants.
 *
 * `ENGINE_VERSION` surfaces in `GET /v1/health`, `GET /v1/version`, the
 * `X-Houston-Engine-Version` header, and `engine.json`. The Rust engine uses
 * its crate version (`CARGO_PKG_VERSION`); this TS engine carries its own.
 * `protocol` stays `1` for wire compatibility with existing clients.
 */

export { PROTOCOL_VERSION } from "@houston-ai/engine-protocol";

export const ENGINE_VERSION = "0.1.0";
