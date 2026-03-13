import { describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "../agents/core/types";
import { buildHumanPromptMeta } from "../agents/core/human-prompt-meta";

describe("buildHumanPromptMeta", () => {
  it("preserves sender ENS and address already present on the message", async () => {
    const resolveEnsName = vi.fn().mockResolvedValue("ignored.eth");
    const message: AgentMessage = {
      id: "msg-1",
      from: "noun-user",
      to: "swarm-agent",
      topic: "human-prompt",
      payload: {
        prompt: "Find promising Nouns proposals this week.",
        senderAddress: "0x000000000000000000000000000000000000dEaD",
        senderEns: "builder.eth",
      },
      timestamp: Date.now(),
    };

    const meta = await buildHumanPromptMeta(message, {
      relayedFrom: "noun.wtf",
      receivedAt: 123,
      resolveEnsName,
    });

    expect(meta).toEqual({
      sender: {
        address: "0x000000000000000000000000000000000000dEaD",
        ens: "builder.eth",
      },
      humanPrompt: true,
      promptText: "Find promising Nouns proposals this week.",
      promptPreview: "Find promising Nouns proposals this week.",
      relayedFrom: "noun.wtf",
      receivedAt: 123,
    });
    expect(resolveEnsName).not.toHaveBeenCalled();
  });

  it("resolves ENS from the sender address when the prompt is present", async () => {
    const resolveEnsName = vi.fn().mockResolvedValue("delegate.eth");
    const message: AgentMessage = {
      id: "msg-2",
      from: "noun-user",
      to: "coordinator",
      topic: "chat-message",
      payload: {
        content: "Track every new trait floor move tonight.",
        user: {
          address: "0x000000000000000000000000000000000000bEEF",
        },
      },
      timestamp: Date.now(),
    };

    const meta = await buildHumanPromptMeta(message, { resolveEnsName });

    expect(meta?.sender).toEqual({
      address: "0x000000000000000000000000000000000000bEEF",
      ens: "delegate.eth",
    });
    expect(meta?.humanPrompt).toBe(true);
    expect(meta?.promptText).toBe("Track every new trait floor move tonight.");
    expect(resolveEnsName).toHaveBeenCalledWith(
      "0x000000000000000000000000000000000000bEEF",
    );
  });

  it("returns null when the relayed message does not contain a prompt", async () => {
    const message: AgentMessage = {
      id: "msg-3",
      from: "scanner-agent",
      to: "*",
      topic: "new-token-launch",
      payload: {
        tokenAddress: "0x0000000000000000000000000000000000000001",
      },
      timestamp: Date.now(),
    };

    const meta = await buildHumanPromptMeta(message);

    expect(meta).toBeNull();
  });
});
