import { initRpc, setRpcUrl, getRpcUrl } from '../shared/rpc';
import {
  createNewWallet, importWallet, unlockWallet, lockWallet,
  getWalletInfo, hasWallet
} from '../shared/wallet';
import { fetchEntityData, fetchComments } from './rpc-handler';
import { rateEntity, submitComment, tipEntity, tipComment, voteComment, sendEth } from './wallet-handler';
import type { Message, MessageResponse } from '../shared/types';

// Initialize RPC on service worker start
initRpc();

// ============================================================================
// MESSAGE ROUTER
// ============================================================================

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse: (response: MessageResponse) => void) => {
    handleMessage(message)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: err.message || String(err) }));
    return true; // async response
  }
);

async function handleMessage(msg: Message): Promise<MessageResponse> {
  switch (msg.type) {
    // ─── READS ───
    case 'GET_ENTITY_DATA': {
      const data = await fetchEntityData(msg.identifier);
      return { ok: true, data };
    }
    case 'GET_COMMENTS': {
      const comments = await fetchComments(msg.entityHash, msg.offset, msg.limit);
      return { ok: true, data: comments };
    }
    case 'GET_CURRENT_PAGE_DATA': {
      // Handled by popup — get active tab URL, fetch entity data
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const data = await fetchEntityData(tab.url);
        return { ok: true, data };
      }
      return { ok: false, error: 'No active tab' };
    }

    // ─── WRITES ───
    case 'RATE_ENTITY': {
      const hash = await rateEntity(msg.entityHash, msg.score);
      return { ok: true, data: { txHash: hash } };
    }
    case 'SUBMIT_COMMENT': {
      const hash = await submitComment(msg.entityHash, msg.content, msg.parentId);
      return { ok: true, data: { txHash: hash } };
    }
    case 'TIP_ENTITY': {
      const hash = await tipEntity(msg.entityHash, msg.amountWei);
      return { ok: true, data: { txHash: hash } };
    }
    case 'TIP_COMMENT': {
      const hash = await tipComment(msg.commentId, msg.amountWei);
      return { ok: true, data: { txHash: hash } };
    }
    case 'VOTE_COMMENT': {
      const hash = await voteComment(msg.commentId, msg.vote);
      return { ok: true, data: { txHash: hash } };
    }
    case 'SEND_ETH': {
      const hash = await sendEth(msg.to, msg.amountWei);
      return { ok: true, data: { txHash: hash } };
    }

    // ─── WALLET ───
    case 'GET_WALLET_INFO': {
      const info = await getWalletInfo();
      return { ok: true, data: info };
    }
    case 'CREATE_WALLET': {
      const address = await createNewWallet(msg.password);
      return { ok: true, data: { address } };
    }
    case 'IMPORT_WALLET': {
      const address = await importWallet(msg.privateKey, msg.password);
      return { ok: true, data: { address } };
    }
    case 'UNLOCK_WALLET': {
      const address = await unlockWallet(msg.password);
      return { ok: true, data: { address } };
    }
    case 'LOCK_WALLET': {
      lockWallet();
      return { ok: true };
    }

    // ─── SETTINGS ───
    case 'SET_RPC_URL': {
      setRpcUrl(msg.url);
      return { ok: true };
    }
    case 'GET_SETTINGS': {
      return { ok: true, data: { rpcUrl: getRpcUrl() } };
    }

    default:
      return { ok: false, error: `Unknown message type` };
  }
}

// Log startup
console.log('pooter world service worker started');
