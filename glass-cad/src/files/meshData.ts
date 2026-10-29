// Imported triangles are stored in the design as base64 text (designs are JSON).
// Decoding is cached per mesh id, since the same mesh is read on every rebuild.

const decoded = new Map<string, Float32Array>();

export function encodePositions(positions: Float32Array): string {
  const bytes = new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function decodePositions(id: string, data: string): Float32Array {
  const hit = decoded.get(id);
  if (hit) return hit;
  const s = atob(data);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  const out = new Float32Array(bytes.buffer);
  decoded.set(id, out);
  return out;
}
