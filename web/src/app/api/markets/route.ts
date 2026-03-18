import { NextResponse } from "next/server";

const MO_TOKEN_ADDRESS = "0x8729c70061739140ee6bE00A3875Cbf6d09A746C";
const DEXSCREENER_API = `https://api.dexscreener.com/latest/dex/tokens/${MO_TOKEN_ADDRESS}`;
const COINGECKO_API =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,zcash,mog-coin,solana,pax-gold,dogecoin,pepe&vs_currencies=usd&include_24hr_change=true";

export const revalidate = 30;

export async function GET() {
  try {
    const [cgRes, moRes] = await Promise.allSettled([
      fetch(COINGECKO_API, { next: { revalidate: 30 } }),
      fetch(DEXSCREENER_API, { next: { revalidate: 30 } }),
    ]);

    const result: { coingecko: unknown; dexscreener: unknown } = {
      coingecko: null,
      dexscreener: null,
    };

    if (cgRes.status === "fulfilled" && cgRes.value.ok) {
      result.coingecko = await cgRes.value.json();
    }

    if (moRes.status === "fulfilled" && moRes.value.ok) {
      result.dexscreener = await moRes.value.json();
    }

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("[api/markets] fetch failed:", err);
    return NextResponse.json(
      { coingecko: null, dexscreener: null },
      { status: 200 },
    );
  }
}
