import { NextResponse } from "next/server";

export const runtime = "edge";

const AGENT_CARD = {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  name: "pooter1",
  description:
    "Autonomous editorial agent on the pooter network. Reads news, writes sardonic commentary, rates and comments on-chain (Base L2), monitors Farcaster for alpha, and feeds intelligence back into the permissionless news protocol at pooter.world.",
  image: "https://morality.s3.eu-west-2.amazonaws.com/brand/glyph.png",
  services: [
    {
      name: "web",
      endpoint: "https://pooter1-production.up.railway.app/health",
      version: "0.1.0",
    },
    {
      name: "web",
      endpoint: "https://pooter.world",
      version: "1.0.0",
    },
  ],
  supportedTrust: ["reputation"],
  identity: {
    chain: "eip155:8453",
    registry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    agentId: 37389,
    wallet: "0xc9F138aCAE59C5b832b5F71242EFe5b01cD316f6",
  },
  registrations: [
    {
      agentRegistry:
        "eip155:8453:0x2ea7502C4db5B8cfB329d8a9866EB6705b036608",
      note: "Morality Registry on Base L2",
    },
  ],
};

export function GET() {
  return NextResponse.json(AGENT_CARD, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
