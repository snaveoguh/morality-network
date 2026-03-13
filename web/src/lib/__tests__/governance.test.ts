import { describe, expect, it } from "vitest";
import {
  convertDelegationToProposal,
  isGovernanceRelevantCast,
  isRecentGovernanceActivity,
  normalizeGovernanceCast,
} from "../governance";
import type { Cast } from "../farcaster";
import type { NounsDelegationEvent } from "../nouns";

function makeCast(overrides: Partial<Cast>): Cast {
  return {
    hash: overrides.hash || "0xcast",
    author: overrides.author || {
      fid: 42,
      username: "nounsquare",
      displayName: "Nounsquare",
      pfpUrl: "https://example.com/pfp.png",
      bio: "",
      followerCount: 100,
      followingCount: 20,
      verifiedAddresses: ["0x1234567890abcdef1234567890abcdef12345678"],
    },
    text: overrides.text || "",
    timestamp: overrides.timestamp || "2026-03-12T12:00:00.000Z",
    likes: overrides.likes || 0,
    recasts: overrides.recasts || 0,
    replies: overrides.replies || 0,
    embeds: overrides.embeds || [],
    parentUrl: overrides.parentUrl,
    channel: overrides.channel,
  };
}

describe("governance activity helpers", () => {
  it("maps delegation logs into proposal-shaped governance activity", () => {
    const event: NounsDelegationEvent = {
      id: "nouns-delegation-0xtx-7",
      delegator: "0x1234567890abcdef1234567890abcdef12345678",
      fromDelegate: "0x1111111111111111111111111111111111111111",
      toDelegate: "0x2222222222222222222222222222222222222222",
      blockNumber: 22123456,
      txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      logIndex: 7,
      timestamp: 1760000000,
      dao: "nouns",
    };

    const proposal = convertDelegationToProposal(event);

    expect(proposal.id).toBe(event.id);
    expect(proposal.dao).toBe("Nouns DAO");
    expect(proposal.source).toBe("onchain");
    expect(proposal.link).toContain(event.txHash);
    expect(proposal.tags).toContain("delegation");
    expect(proposal.body).toContain("redirected");
    expect(proposal.fullBody).toContain(event.delegator);
    expect(isRecentGovernanceActivity(proposal, event.timestamp + 60)).toBe(true);
    expect(
      isRecentGovernanceActivity(proposal, event.timestamp + 4 * 24 * 60 * 60)
    ).toBe(false);
  });

  it("only accepts Farcaster posts that are both nouns-related and governance-related", () => {
    const delegationCast = makeCast({
      text: "noun.wtf just picked up another delegation. Delegate to the new steward before proposal 719 closes.",
      likes: 12,
      recasts: 4,
      replies: 3,
      channel: "nouns",
    });
    const unrelatedCast = makeCast({
      hash: "0xother",
      text: "Nouns art drop tonight. Great colors and clean line work.",
      likes: 20,
      recasts: 10,
      replies: 1,
      channel: "art",
    });

    expect(isGovernanceRelevantCast(delegationCast)).toBe(true);
    expect(isGovernanceRelevantCast(unrelatedCast)).toBe(false);

    const signal = normalizeGovernanceCast(delegationCast);
    expect(signal.relatedDao).toBe("Nouns DAO");
    expect(signal.tags).toContain("delegation");
    expect(signal.tags).toContain("nouns");
    expect(signal.engagement.score).toBe(39);
    expect(signal.link).toContain(delegationCast.hash);
  });
});
