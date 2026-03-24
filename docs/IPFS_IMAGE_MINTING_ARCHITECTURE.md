# Architecture: Mint-to-IPFS Image Storage on Base

> Replace self-hosted illustration storage (Redis + JSON) with on-chain minting on Base, using the mint flow to pin images to IPFS permanently.

## Implementation Status

| Component | Status | File |
|-----------|--------|------|
| PooterImageVault contract | Done | `contracts/src/PooterImageVault.sol` |
| Deploy script | Done | `contracts/script/DeployImageVault.s.sol` |
| IPFS upload helper (Pinata) | Done | `web/src/lib/ipfs-upload.ts` |
| On-chain mint helper | Done | `web/src/lib/server/image-vault.ts` |
| Contract ABI + address wiring | Done | `web/src/lib/contracts.ts` |
| Daily illustration cron update | Done | `web/src/app/api/cron/daily-illustration/route.ts` |
| Illustration endpoint (IPFS-first) | Done | `web/src/app/api/edition/[tokenId]/illustration/route.ts` |
| **Deploy contract to Base Sepolia** | TODO | Run `DeployImageVault.s.sol` with `forge script` |
| **Set env vars on dev.pooter.world** | TODO | `PINATA_JWT`, `AGENT_PRIVATE_KEY`, `POOTER_IMAGE_VAULT_ADDRESS` |
| **Backfill existing illustrations** | TODO | One-time script to upload Redis images to IPFS |

## Problem

The current illustration pipeline has durability and scalability issues:

1. **Redis TTL expires** — Upstash illustrations expire after 30 days, silently losing images
2. **`illustrations.json` is a growing blob** — 4MB+ committed to git, doesn't work on Vercel's read-only FS
3. **No permanence** — images are ephemeral; if both Redis and local file miss, the illustration is gone
4. **No provenance** — no on-chain record linking an image to its editorial content

## Proposal

Mint each DALL-E illustration as an NFT on Base. The minting process pins the image to IPFS. Use the IPFS CID as the canonical image URL everywhere.

```
DALL-E → base64 PNG → upload to IPFS (Pinata) → mint NFT with CID → serve via ipfs:// gateway
```

### Why This Works

- **IPFS CID = content hash** — the URL *is* the integrity check
- **Pinning is cheap/free** — Pinata free tier: 500 files, 1GB (at ~1-2MB/day = ~1 year free)
- **Base gas is negligible** — ~$0.001-0.01 per mint on Base L2
- **On-chain image database** — every illustration gets an immutable on-chain record with metadata, queryable via indexer
- **Decoupled from server** — images load from IPFS gateways even if Vercel is down

## Implementation Plan

### 1. Deploy `PooterImageVault` Contract

A minimal ERC721 that stores IPFS CIDs for each minted image. Not the editions contract — this is a separate image registry.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PooterImageVault is ERC721, Ownable {
    uint256 public nextTokenId;

    struct ImageRecord {
        string ipfsCID;        // "bafkrei..."
        bytes32 contentHash;   // keccak256 of the raw image bytes
        uint256 editionNumber; // link back to PooterEditions (0 if standalone)
        uint256 mintedAt;
    }

    mapping(uint256 => ImageRecord) public images;
    mapping(uint256 => uint256) public editionToImage; // editionNumber → imageTokenId

    event ImageMinted(uint256 indexed tokenId, string ipfsCID, uint256 indexed editionNumber);

    constructor() ERC721("Pooter Images", "PIMG") Ownable(msg.sender) {}

    function mint(
        string calldata ipfsCID,
        bytes32 contentHash,
        uint256 editionNumber
    ) external onlyOwner returns (uint256 tokenId) {
        tokenId = ++nextTokenId;
        images[tokenId] = ImageRecord({
            ipfsCID: ipfsCID,
            contentHash: contentHash,
            editionNumber: editionNumber,
            mintedAt: block.timestamp
        });
        if (editionNumber > 0) {
            editionToImage[editionNumber] = tokenId;
        }
        _mint(msg.sender, tokenId);
        emit ImageMinted(tokenId, ipfsCID, editionNumber);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat("ipfs://", images[tokenId].ipfsCID);
    }

    function getImageByEdition(uint256 editionNumber) external view returns (string memory ipfsCID) {
        uint256 imgId = editionToImage[editionNumber];
        if (imgId == 0) return "";
        return images[imgId].ipfsCID;
    }
}
```

**Why a separate contract?**
- PooterEditions is for daily editions (auction/collectible layer)
- PooterImageVault is for raw image storage (infrastructure layer)
- Any image can be stored, not just edition illustrations
- Clean separation of concerns

### 2. IPFS Upload Helper (Pinata)

```typescript
// web/src/lib/ipfs-upload.ts
const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY_URL || "https://gateway.pinata.cloud";

export async function uploadToIPFS(
  imageBuffer: Buffer,
  metadata: { name: string; editionNumber?: number }
): Promise<{ cid: string; ipfsUrl: string; gatewayUrl: string }> {
  const form = new FormData();
  form.append("file", new Blob([imageBuffer]), `${metadata.name}.png`);
  form.append("pinataMetadata", JSON.stringify({
    name: metadata.name,
    keyvalues: { editionNumber: metadata.editionNumber?.toString() ?? "" }
  }));

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: form,
  });

  if (!res.ok) throw new Error(`Pinata upload failed: ${res.status}`);
  const { IpfsHash } = await res.json();

  return {
    cid: IpfsHash,
    ipfsUrl: `ipfs://${IpfsHash}`,
    gatewayUrl: `${PINATA_GATEWAY}/ipfs/${IpfsHash}`,
  };
}
```

### 3. Updated Daily Illustration Cron

The new flow in `daily-illustration/route.ts`:

```
1. Generate DALL-E image → get base64 PNG
2. Convert to Buffer
3. Upload to Pinata → get IPFS CID
4. Mint on PooterImageVault → get tokenId + on-chain receipt
5. Store CID reference on editorial record (tiny string, not 1MB base64)
6. Done — no Redis, no illustrations.json
```

### 4. Updated Metadata & Serving

**Edition metadata endpoint** (`/api/edition/[tokenId]`):
- Read `editionToImage(editionNumber)` from PooterImageVault
- Return `"image": "ipfs://bafkrei..."` in the ERC-721 metadata JSON
- Fallback: gateway URL for clients that don't resolve ipfs://

**Illustration endpoint** (`/api/edition/[tokenId]/illustration`):
- Proxy the IPFS gateway URL (with cache headers)
- Or redirect to the gateway URL directly (302)
- Keeps backward compatibility with existing `<img src="/api/edition/...">`

**Frontend components** (AuctionCard, ArticleTemplate):
- No change needed if we keep the proxy endpoint
- Optionally: use gateway URL directly for faster loads

### 5. Migration / Backfill

For existing illustrations still in Redis:
1. Read each from Redis before TTL expires
2. Upload to Pinata
3. Mint on PooterImageVault with the edition number
4. Update editorial record with CID
5. Delete from Redis after confirmation

### 6. Cleanup

After migration:
- Delete `web/src/lib/illustration-store.ts`
- Delete `web/src/data/illustrations.json`
- Remove Redis illustration code from cron routes
- Remove `UPSTASH_*` env vars if no longer needed elsewhere

## Cost Analysis

| Item | Cost |
|------|------|
| Pinata free tier | 500 pins, 1GB — covers ~1 year of daily images |
| Pinata paid (if needed) | $20/mo for 50GB |
| Base gas per mint | ~$0.001-0.01 |
| Contract deployment | ~$0.50-2.00 one-time |
| **Annual cost (year 1)** | **~$5-10 total** |

vs. current: Upstash Redis ($0 free tier but images expire after 30 days)

## Env Vars Needed

```
PINATA_JWT=               # Pinata API JWT token
PINATA_GATEWAY_URL=       # Optional custom gateway
POOTER_IMAGE_VAULT_ADDRESS=  # Deployed contract address
```

## Bonus: On-Chain Image Database

Every minted image gets:
- **IPFS CID** (content-addressed, permanent)
- **Content hash** (keccak256 of raw bytes, on-chain)
- **Edition link** (which daily edition it belongs to)
- **Timestamp** (when it was minted)
- **Event logs** (queryable via indexer)

This creates a provenance-tracked, on-chain image corpus that can be:
- Queried via the indexer for training data
- Verified for authenticity (content hash matches CID)
- Used as a public dataset with clear provenance
- Referenced by any other contract or protocol

## Alternatives Considered

| Approach | Pros | Cons |
|----------|------|------|
| **Zora 1155** | Zora marketplace visibility, creator rewards | Zora mint fee ($0.000777/mint), no built-in IPFS pinning (must bring your own Pinata), SDK complexity |
| **thirdweb + Engine** | Auto IPFS pinning (built-in), no mint fee, simple server-side DX | Separate from Zora ecosystem, vendor dependency on thirdweb infra |
| **Pinata + custom ERC721** (chosen) | Full control, simple HTTP API (no SDK), cheapest, no vendor lock-in | Must manage Pinata account (free tier: 500 files, 1GB) |
| **web3.storage / nft.storage** | Free Filecoin storage | Unreliable availability, services have shut down before |
| **Arweave direct** | Truly permanent | More expensive, different ecosystem |
| **Keep current Redis** | No work | Images expire, not permanent, repo bloat |

### Research Notes (Zora vs thirdweb)

**Zora Protocol SDK** (`@zoralabs/protocol-sdk`): Does NOT pin to IPFS for you — you must
bring your own Pinata/Infura. Charges 0.000777 ETH per mint (~$1.50-2.00). Main benefit is
appearing on zora.co marketplace. SDK uses `create1155()` with viem walletClient.

**thirdweb v5** (`thirdweb`): Auto-uploads and pins media+metadata to IPFS via built-in
storage infra. No per-mint protocol fee. `Engine.serverWallet()` for server-side minting.
But adds a large SDK dependency and ties you to thirdweb's infra.

**Decision**: Pinata + custom ERC-721. Since we need our own Pinata anyway even with Zora,
and thirdweb adds unnecessary vendor coupling, the simplest path is direct Pinata HTTP API
calls + our own UUPS-upgradeable contract. Zero new npm dependencies.
