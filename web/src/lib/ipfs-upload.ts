import "server-only";

// ============================================================================
// IPFS UPLOAD — Pin images to IPFS via Pinata
//
// Used by the daily illustration pipeline to permanently store DALL-E images.
// The returned CID is stored on-chain in PooterImageVault for provenance.
// ============================================================================

const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PINATA_GATEWAY_DEFAULT = "https://gateway.pinata.cloud";

export interface IPFSUploadResult {
  cid: string;
  ipfsUrl: string;
  gatewayUrl: string;
}

/**
 * Upload an image buffer to IPFS via Pinata.
 *
 * Requires PINATA_JWT env var. Optional PINATA_GATEWAY_URL for custom gateway.
 * Returns the IPFS CID and gateway URL for immediate serving.
 */
export async function uploadToIPFS(
  imageBuffer: Buffer,
  metadata: { name: string; editionNumber?: number },
): Promise<IPFSUploadResult> {
  const jwt = process.env.PINATA_JWT?.trim();
  if (!jwt) {
    throw new Error("PINATA_JWT not configured — cannot upload to IPFS");
  }

  const gateway =
    process.env.PINATA_GATEWAY_URL?.trim() || PINATA_GATEWAY_DEFAULT;

  const form = new FormData();
  form.append(
    "file",
    new Blob([imageBuffer], { type: "image/png" }),
    `${metadata.name}.png`,
  );
  form.append(
    "pinataMetadata",
    JSON.stringify({
      name: metadata.name,
      keyvalues: {
        editionNumber: metadata.editionNumber?.toString() ?? "",
        source: "pooter-daily-illustration",
      },
    }),
  );

  console.log(
    `[ipfs-upload] Uploading ${metadata.name} (${Math.round(imageBuffer.length / 1024)}KB)`,
  );

  const res = await fetch(PINATA_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Pinata upload failed: HTTP ${res.status} — ${body.slice(0, 200)}`,
    );
  }

  const { IpfsHash } = (await res.json()) as { IpfsHash: string };

  console.log(`[ipfs-upload] Pinned: ${IpfsHash}`);

  return {
    cid: IpfsHash,
    ipfsUrl: `ipfs://${IpfsHash}`,
    gatewayUrl: `${gateway}/ipfs/${IpfsHash}`,
  };
}
