/**
 * `engine/` is reserved for low-level, framework-agnostic gameplay primitives
 * that you might want to extract into a standalone npm package later
 * (entity registries, ECS storage, deterministic RNG, replay encoders…).
 *
 * Today the runtime engine lives at `core/Engine.ts`. This barrel keeps the
 * folder reserved so feature additions land in a predictable place.
 */
export {};
