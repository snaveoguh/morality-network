// Shim for "server-only" package when running outside Next.js (e.g. worker).
// The real package throws "This module cannot be imported from a Client Component".
// In the worker context we ARE server-side, so this is safe to no-op.
